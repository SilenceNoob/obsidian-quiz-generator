import { App, Modal, Setting, TFile, FuzzySuggestModal, Notice, FuzzyMatch } from 'obsidian';
import { NoteSelector, NoteSelectorOptions } from './NoteSelector';

export interface SelectedNote {
	path: string;
	content: string;
	title: string;
}

export class NoteSelectionModal extends Modal {
	private noteSelector: NoteSelector;
	private onNoteSelected: (note: SelectedNote) => void;
	private noteSelectorOptions: NoteSelectorOptions;

	constructor(
		app: App, 
		noteSelectorOptions: NoteSelectorOptions,
		onNoteSelected: (note: SelectedNote) => void
	) {
		super(app);
		this.noteSelectorOptions = noteSelectorOptions;
		this.noteSelector = new NoteSelector(app, noteSelectorOptions);
		this.onNoteSelected = onNoteSelected;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('note-selection-modal');

		contentEl.createEl('h2', { text: '选择笔记生成测验' });

		// 随机选择按钮
		new Setting(contentEl)
			.setName('随机选择笔记')
			.setDesc('从符合条件的笔记中随机选择一篇进行测验生成')
			.addButton(button => {
				button
					.setButtonText('🎲 随机选择')
					.setCta()
					.onClick(async () => {
						await this.selectRandomNote();
					});
			});

		// 分隔线
		contentEl.createEl('hr', { cls: 'note-selection-divider' });

		// 手动选择笔记
		new Setting(contentEl)
			.setName('手动选择笔记')
			.setDesc('搜索并选择特定的笔记进行测验生成')
			.addButton(button => {
				button
					.setButtonText('🔍 搜索选择')
					.onClick(() => {
						new NoteSearchModal(this.app, this.noteSelectorOptions, (note) => {
							this.close();
							this.onNoteSelected(note);
						}).open();
					});
			});

		// 当前笔记选项
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile && activeFile.extension === 'md') {
			contentEl.createEl('hr', { cls: 'note-selection-divider' });
			
			new Setting(contentEl)
				.setName('使用当前笔记')
				.setDesc(`当前打开的笔记：${activeFile.basename}`)
				.addButton(button => {
					button
						.setButtonText('📄 使用当前笔记')
						.onClick(async () => {
							await this.selectCurrentNote();
						});
				});
		}

		// 取消按钮
		contentEl.createEl('hr', { cls: 'note-selection-divider' });
		new Setting(contentEl)
			.addButton(button => {
				button
					.setButtonText('取消')
					.onClick(() => {
						this.close();
					});
			});
	}

	private async selectRandomNote() {
		try {
			new Notice('正在选择随机笔记...');
			
			const selectedNote = await this.noteSelector.selectRandomNote();
			if (!selectedNote) {
				new Notice('没有找到符合条件的笔记，请检查设置或添加更多内容。');
				return;
			}

			new Notice(`已选择笔记：${selectedNote.title}`);
			this.close();
			this.onNoteSelected(selectedNote);
			
		} catch (error) {
			console.error('Error selecting random note:', error);
			new Notice('选择随机笔记时出错，请查看控制台了解详情。');
		}
	}

	private async selectCurrentNote() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请打开一个 Markdown 文件。');
			return;
		}

		try {
			const content = await this.app.vault.read(activeFile);
			const cleanContent = this.cleanMarkdownContent(content);
			
			if (this.countWords(cleanContent) < this.noteSelectorOptions.minWordCount) {
				new Notice(`当前笔记内容太少（少于 ${this.noteSelectorOptions.minWordCount} 词），无法生成有效的测验题。`);
				return;
			}

			const selectedNote: SelectedNote = {
				path: activeFile.path,
				content: cleanContent,
				title: activeFile.basename
			};

			this.close();
			this.onNoteSelected(selectedNote);
			
		} catch (error) {
			console.error('Error selecting current note:', error);
			new Notice('选择当前笔记时出错，请查看控制台了解详情。');
		}
	}

	private cleanMarkdownContent(content: string): string {
		// 移除 YAML front matter
		content = content.replace(/^---[\s\S]*?---\n?/, '');
		
		// 移除 Markdown 语法
		content = content.replace(/!\[.*?\]\(.*?\)/g, ''); // 图片
		content = content.replace(/\[.*?\]\(.*?\)/g, '$1'); // 链接，保留文本
		content = content.replace(/#{1,6}\s+/g, ''); // 标题
		content = content.replace(/\*\*(.*?)\*\*/g, '$1'); // 粗体
		content = content.replace(/\*(.*?)\*/g, '$1'); // 斜体
		content = content.replace(/`(.*?)`/g, '$1'); // 行内代码
		content = content.replace(/```[\s\S]*?```/g, ''); // 代码块
		content = content.replace(/^\s*[-*+]\s+/gm, ''); // 列表项
		content = content.replace(/^\s*\d+\.\s+/gm, ''); // 有序列表
		content = content.replace(/^\s*>\s+/gm, ''); // 引用
		
		// 清理多余的空白字符
		content = content.replace(/\n\s*\n/g, '\n');
		content = content.trim();
		
		return content;
	}

	private countWords(text: string): number {
		return text.split(/\s+/).filter(word => word.length > 0).length;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class NoteSearchModal extends FuzzySuggestModal<TFile> {
	private noteSelectorOptions: NoteSelectorOptions;
	private onNoteSelected: (note: SelectedNote) => void;
	private eligibleFiles: TFile[];

	constructor(
		app: App, 
		noteSelectorOptions: NoteSelectorOptions,
		onNoteSelected: (note: SelectedNote) => void
	) {
		super(app);
		this.noteSelectorOptions = noteSelectorOptions;
		this.onNoteSelected = onNoteSelected;
		this.eligibleFiles = [];
		this.loadEligibleFiles();
	}

	private async loadEligibleFiles() {
		const allFiles = this.app.vault.getMarkdownFiles();
		this.eligibleFiles = [];

		for (const file of allFiles) {
			// 检查文件是否符合条件
			if (this.isFileEligible(file)) {
				try {
					const content = await this.app.vault.read(file);
					const cleanContent = this.cleanMarkdownContent(content);
					
					if (this.countWords(cleanContent) >= this.noteSelectorOptions.minWordCount) {
						this.eligibleFiles.push(file);
					}
				} catch (error) {
					console.error(`Error reading file ${file.path}:`, error);
				}
			}
		}
	}

	private isFileEligible(file: TFile): boolean {
		// 检查文件扩展名
		if (!this.noteSelectorOptions.fileExtensions.includes(file.extension)) {
			return false;
		}

		// 检查排除的文件夹
		for (const excludeFolder of this.noteSelectorOptions.excludeFolders) {
			if (file.path.startsWith(excludeFolder + '/') || file.path === excludeFolder) {
				return false;
			}
		}

		return true;
	}

	getItems(): TFile[] {
		return this.eligibleFiles;
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	getItemPath(file: TFile): string {
		return file.path;
	}

	renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement) {
		const file = match.item;
		const titleEl = el.createDiv({ cls: 'note-title' });
		titleEl.setText(file.basename);
		
		const pathEl = el.createDiv({ cls: 'note-path' });
		pathEl.setText(file.path);
	}

	onChooseSuggestion(match: FuzzyMatch<TFile>, evt: MouseEvent | KeyboardEvent) {
		const file = match.item;
		return this.onChooseItem(file, evt);
	}

	async onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
		try {
			const content = await this.app.vault.read(file);
			const cleanContent = this.cleanMarkdownContent(content);

			const selectedNote: SelectedNote = {
				path: file.path,
				content: cleanContent,
				title: file.basename
			};

			this.onNoteSelected(selectedNote);
		} catch (error) {
			console.error('Error selecting note:', error);
			new Notice('选择笔记时出错，请重试。');
		}
	}

	private cleanMarkdownContent(content: string): string {
		// 移除 YAML front matter
		content = content.replace(/^---[\s\S]*?---\n?/, '');
		
		// 移除 Markdown 语法
		content = content.replace(/!\[.*?\]\(.*?\)/g, ''); // 图片
		content = content.replace(/\[.*?\]\(.*?\)/g, '$1'); // 链接，保留文本
		content = content.replace(/#{1,6}\s+/g, ''); // 标题
		content = content.replace(/\*\*(.*?)\*\*/g, '$1'); // 粗体
		content = content.replace(/\*(.*?)\*/g, '$1'); // 斜体
		content = content.replace(/`(.*?)`/g, '$1'); // 行内代码
		content = content.replace(/```[\s\S]*?```/g, ''); // 代码块
		content = content.replace(/^\s*[-*+]\s+/gm, ''); // 列表项
		content = content.replace(/^\s*\d+\.\s+/gm, ''); // 有序列表
		content = content.replace(/^\s*>\s+/gm, ''); // 引用
		
		// 清理多余的空白字符
		content = content.replace(/\n\s*\n/g, '\n');
		content = content.trim();
		
		return content;
	}

	private countWords(text: string): number {
		return text.split(/\s+/).filter(word => word.length > 0).length;
	}
}