import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { DeepSeekAPI } from './src/DeepSeekAPI';
import { QuestionGenerator, QuestGeneratorSettings as QuizSettings } from './src/QuestionGenerator';
import { NoteSelector, NoteSelectorOptions } from './src/NoteSelector';
import { QuizModal, QuizResult } from './src/QuizModal';
import { ResultModal } from './src/ResultModal';
import { ScoreManager } from './src/ScoreManager';
import { StatisticsModal } from './src/StatisticsModal';

interface QuestGeneratorSettings {
	deepSeekApiKey: string;
	questionCount: number;
	questionTypes: {
		multipleChoice: boolean;
		multipleAnswer: boolean;
		trueFalse: boolean;
	};
	difficulty: 'easy' | 'medium' | 'hard';
	noteSelectorOptions: NoteSelectorOptions;
	modalSize: {
		width: number;
		height: number;
	};
}

const DEFAULT_SETTINGS: QuestGeneratorSettings = {
	deepSeekApiKey: '',
	questionCount: 5,
	questionTypes: {
		multipleChoice: true,
		multipleAnswer: true,
		trueFalse: true
	},
	difficulty: 'medium',
	noteSelectorOptions: {
		minWordCount: 100,
		excludeFolders: ['.obsidian', '.trash'],
		includeSubfolders: true,
		fileExtensions: ['md']
	},
	modalSize: {
		width: 800,
		height: 600
	}
};

export default class QuestGeneratorPlugin extends Plugin {
	settings: QuestGeneratorSettings;
	private deepSeekAPI: DeepSeekAPI;
	private questionGenerator: QuestionGenerator;
	private noteSelector: NoteSelector;
	private scoreManager: ScoreManager;

	async onload() {
		await this.loadSettings();

		// Initialize components
		this.deepSeekAPI = new DeepSeekAPI(this.settings.deepSeekApiKey);
		this.questionGenerator = new QuestionGenerator(this.deepSeekAPI);
		this.noteSelector = new NoteSelector(this.app, this.settings.noteSelectorOptions);
		this.scoreManager = new ScoreManager(this.app);

		// Add ribbon icon
		const ribbonIconEl = this.addRibbonIcon('brain', '生成测验题', async (evt: MouseEvent) => {
			await this.startQuizGeneration();
		});
		ribbonIconEl.addClass('quest-generator-ribbon');

		// Add commands
		this.addCommand({
			id: 'generate-quiz-random',
			name: '从随机笔记生成测验',
			callback: async () => {
				await this.startQuizGeneration();
			}
		});

		this.addCommand({
			id: 'generate-quiz-current',
			name: '从当前笔记生成测验',
			callback: async () => {
				await this.generateQuizFromCurrentNote();
			}
		});

		this.addCommand({
			id: 'test-deepseek-connection',
			name: '测试 DeepSeek API 连接',
			callback: async () => {
				await this.testDeepSeekConnection();
			}
		});

		this.addCommand({
			id: 'show-quiz-statistics',
			name: '查看测验统计',
			callback: async () => {
				await this.showStatistics();
			}
		});

		// Add settings tab
		this.addSettingTab(new QuestGeneratorSettingTab(this.app, this));

		console.log('Quest Generator Plugin loaded');
	}

	onunload() {
		console.log('Quest Generator Plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// Update components with new settings
		if (this.deepSeekAPI) {
			this.deepSeekAPI.updateApiKey(this.settings.deepSeekApiKey);
		}
		if (this.noteSelector) {
			this.noteSelector.updateOptions(this.settings.noteSelectorOptions);
		}
	}

	private async startQuizGeneration() {
		if (!this.validateSettings()) {
			return;
		}

		try {
			new Notice('正在选择随机笔记...');
			
			const selectedNote = await this.noteSelector.selectRandomNote();
			if (!selectedNote) {
				new Notice('没有找到符合条件的笔记，请检查设置或添加更多内容。');
				return;
			}

			new Notice(`已选择笔记：${selectedNote.title}`);
			// 使用文件路径作为记录分数的key，但保留显示标题用于题目生成
			await this.generateQuizFromNote(selectedNote.path, selectedNote.content, selectedNote.title);
			
		} catch (error) {
			console.error('Error starting quiz generation:', error);
			new Notice('生成测验时出错，请查看控制台了解详情。');
		}
	}

	private async generateQuizFromCurrentNote() {
		if (!this.validateSettings()) {
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请打开一个 Markdown 文件。');
			return;
		}

		try {
			new Notice('正在从当前笔记生成测验...');
			
			const content = await this.app.vault.read(activeFile);
			const cleanContent = this.cleanMarkdownContent(content);
			
			if (this.countWords(cleanContent) < this.settings.noteSelectorOptions.minWordCount) {
				new Notice(`当前笔记内容太少（少于 ${this.settings.noteSelectorOptions.minWordCount} 词），无法生成有效的测验题。`);
				return;
			}

			await this.generateQuizFromNote(activeFile.basename, cleanContent);
			
		} catch (error) {
			console.error('Error generating quiz from current note:', error);
			new Notice('生成测验时出错，请查看控制台了解详情。');
		}
	}

	private async generateQuizFromNote(title: string, content: string, displayTitle?: string) {
		// 创建持续显示的加载提示
		const loadingNotice = new Notice('🔄 正在生成测验题，请稍候...', 0); // 0 表示不自动消失
		
		try {
			const quizSettings: QuizSettings = {
				questionCount: this.settings.questionCount,
				questionTypes: this.settings.questionTypes,
				difficulty: this.settings.difficulty
			};

			const questions = await this.questionGenerator.generateQuestions(
				content,
				displayTitle || title, // 使用显示标题（如果提供）或文件名
				quizSettings
			);

			// 隐藏加载提示
			loadingNotice.hide();

			if (questions.length === 0) {
				new Notice('❌ 未能生成任何题目，请尝试调整设置或选择其他笔记。');
				return;
			}

			new Notice(`✅ 成功生成 ${questions.length} 道题目！`);
			
			// Open quiz modal
			const quizModal = new QuizModal(
				this.app,
				questions,
				(result: QuizResult) => {
					this.showQuizResult(result, title);
				},
				this.settings.modalSize
			);
			quizModal.open();
			
		} catch (error) {
			// 隐藏加载提示
			loadingNotice.hide();
			
			console.error('Error generating quiz:', error);
			if (error.message.includes('API key')) {
				new Notice('❌ DeepSeek API 密钥无效，请在设置中检查。');
			} else if (error.message.includes('Failed to parse')) {
				new Notice('❌ AI 响应格式错误，请重试。');
			} else {
				new Notice('❌ 生成测验时出错：' + error.message);
			}
		}
	}

	private async showQuizResult(result: QuizResult, noteTitle: string) {
		// 记录分数到笔记元数据
		await this.scoreManager.recordScore(noteTitle, result);
		
		// 显示结果
		const resultModal = new ResultModal(this.app, result, this.settings.modalSize);
		resultModal.open();
	}

	private async testDeepSeekConnection() {
		if (!this.settings.deepSeekApiKey) {
			new Notice('请先在设置中配置 DeepSeek API 密钥。');
			return;
		}

		try {
			new Notice('正在测试 DeepSeek API 连接...');
			
			const isConnected = await this.deepSeekAPI.testConnection();
			if (isConnected) {
				new Notice('✅ DeepSeek API 连接成功！');
			} else {
				new Notice('❌ DeepSeek API 连接失败，请检查密钥和网络连接。');
			}
		} catch (error) {
			console.error('Error testing DeepSeek connection:', error);
			new Notice('❌ 测试连接时出错：' + error.message);
		}
	}

	private validateSettings(): boolean {
		if (!this.settings.deepSeekApiKey) {
			new Notice('请先在设置中配置 DeepSeek API 密钥。');
			return false;
		}

		const hasEnabledQuestionType = Object.values(this.settings.questionTypes).some(enabled => enabled);
		if (!hasEnabledQuestionType) {
			new Notice('请至少启用一种题目类型。');
			return false;
		}

		if (this.settings.questionCount < 1 || this.settings.questionCount > 20) {
			new Notice('题目数量应在 1-20 之间。');
			return false;
		}

		return true;
	}

	async showStatistics() {
		const statisticsModal = new StatisticsModal(this.app, this.scoreManager);
		statisticsModal.open();
	}

	private cleanMarkdownContent(content: string): string {
		// Remove frontmatter
		content = content.replace(/^---[\s\S]*?---\n?/, '');
		
		// Remove markdown syntax but keep the text
		content = content
			.replace(/^#{1,6}\s+/gm, '')
			.replace(/\*\*([^*]+)\*\*/g, '$1')
			.replace(/\*([^*]+)\*/g, '$1')
			.replace(/__([^_]+)__/g, '$1')
			.replace(/_([^_]+)_/g, '$1')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/\[\[([^\]]+)\]\]/g, '$1')
			.replace(/```[\s\S]*?```/g, '')
			.replace(/`([^`]+)`/g, '$1')
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
			.replace(/^---+$/gm, '')
			.replace(/^>\s+/gm, '')
			.replace(/^[\s]*[-*+]\s+/gm, '')
			.replace(/^[\s]*\d+\.\s+/gm, '')
			.replace(/\n\s*\n/g, '\n')
			.trim();

		return content;
	}

	private countWords(content: string): number {
		if (!content.trim()) return 0;
		return content.split(/\s+/).filter(word => word.length > 0).length;
	}
}

class QuestGeneratorSettingTab extends PluginSettingTab {
	plugin: QuestGeneratorPlugin;

	constructor(app: App, plugin: QuestGeneratorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Plugin header
		containerEl.createEl('h1', { text: 'Quest Generator 设置' });
		containerEl.createEl('p', { 
			text: '配置 DeepSeek API 和测验生成选项',
			cls: 'setting-item-description'
		});

		// API Settings
		containerEl.createEl('h2', { text: 'API 设置' });

		new Setting(containerEl)
			.setName('DeepSeek API 密钥')
			.setDesc('用于生成题目的 DeepSeek API 密钥。获取地址：https://platform.deepseek.com/')
			.addText(text => {
				text.setPlaceholder('sk-...')
					.setValue(this.plugin.settings.deepSeekApiKey)
					.onChange(async (value) => {
						this.plugin.settings.deepSeekApiKey = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'password';
			});

		// Test API connection button
		new Setting(containerEl)
			.setName('测试 API 连接')
			.setDesc('验证 DeepSeek API 密钥是否有效')
			.addButton(button => button
				.setButtonText('测试连接')
				.setCta()
				.onClick(async () => {
					if (!this.plugin.settings.deepSeekApiKey) {
						new Notice('请先输入 API 密钥');
						return;
					}
					button.setButtonText('测试中...');
					button.setDisabled(true);
					
					try {
						const api = new DeepSeekAPI(this.plugin.settings.deepSeekApiKey);
						const isConnected = await api.testConnection();
						if (isConnected) {
							new Notice('✅ API 连接成功！');
						} else {
							new Notice('❌ API 连接失败，请检查密钥');
						}
					} catch (error) {
						new Notice('❌ 连接测试出错：' + error.message);
					} finally {
						button.setButtonText('测试连接');
						button.setDisabled(false);
					}
				}));

		// 测验统计
		new Setting(containerEl)
			.setName('测验统计')
			.setDesc('查看所有笔记的测验成绩统计')
			.addButton(button => button
				.setButtonText('查看统计')
				.onClick(async () => {
					await this.plugin.showStatistics();
				}));

		// Quiz Settings
		containerEl.createEl('h2', { text: '测验设置' });

		new Setting(containerEl)
			.setName('模态框宽度')
			.setDesc('测验模态框的宽度（像素，400-1200）')
			.addSlider(slider => slider
				.setLimits(400, 1200, 50)
				.setValue(this.plugin.settings.modalSize.width)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.modalSize.width = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('模态框高度')
			.setDesc('测验模态框的高度（像素，300-800）')
			.addSlider(slider => slider
				.setLimits(300, 800, 50)
				.setValue(this.plugin.settings.modalSize.height)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.modalSize.height = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('题目数量')
			.setDesc('每次测验生成的题目数量（1-20）')
			.addSlider(slider => slider
				.setLimits(1, 20, 1)
				.setValue(this.plugin.settings.questionCount)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.questionCount = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('难度等级')
			.setDesc('生成题目的难度等级')
			.addDropdown(dropdown => dropdown
				.addOption('easy', '简单')
				.addOption('medium', '中等')
				.addOption('hard', '困难')
				.setValue(this.plugin.settings.difficulty)
				.onChange(async (value: 'easy' | 'medium' | 'hard') => {
					this.plugin.settings.difficulty = value;
					await this.plugin.saveSettings();
				}));

		// Question Types
		containerEl.createEl('h3', { text: '题目类型' });
		containerEl.createEl('p', { 
			text: '选择要生成的题目类型（至少选择一种）',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('单选题')
			.setDesc('包含单选题（4个选项，1个正确答案）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.questionTypes.multipleChoice)
				.onChange(async (value) => {
					this.plugin.settings.questionTypes.multipleChoice = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('多选题')
			.setDesc('包含多选题（4-6个选项，2-3个正确答案）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.questionTypes.multipleAnswer)
				.onChange(async (value) => {
					this.plugin.settings.questionTypes.multipleAnswer = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('判断题')
			.setDesc('包含判断题（正确/错误）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.questionTypes.trueFalse)
				.onChange(async (value) => {
					this.plugin.settings.questionTypes.trueFalse = value;
					await this.plugin.saveSettings();
				}));

		// Note Selection Settings
		containerEl.createEl('h2', { text: '笔记选择设置' });

		new Setting(containerEl)
			.setName('最小词数')
			.setDesc('笔记必须包含的最少词数才能用于生成测验')
			.addText(text => text
				.setPlaceholder('100')
				.setValue(this.plugin.settings.noteSelectorOptions.minWordCount.toString())
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.noteSelectorOptions.minWordCount = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('包含子文件夹')
			.setDesc('在选择笔记时是否包含子文件夹中的文件')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.noteSelectorOptions.includeSubfolders)
				.onChange(async (value) => {
					this.plugin.settings.noteSelectorOptions.includeSubfolders = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('排除文件夹')
			.setDesc('不参与测验生成的文件夹（每行一个）')
			.addTextArea(text => {
				text.setPlaceholder('.obsidian\n.trash\nTemplates\nArchive')
					.setValue(this.plugin.settings.noteSelectorOptions.excludeFolders.join('\n'))
					.onChange(async (value) => {
						this.plugin.settings.noteSelectorOptions.excludeFolders = value
							.split('\n')
							.map(folder => folder.trim())
							.filter(folder => folder.length > 0);
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 4;
			});

		new Setting(containerEl)
			.setName('文件扩展名')
			.setDesc('允许的文件扩展名（逗号分隔）')
			.addText(text => text
				.setPlaceholder('md')
				.setValue(this.plugin.settings.noteSelectorOptions.fileExtensions.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.noteSelectorOptions.fileExtensions = value
						.split(',')
						.map(ext => ext.trim().toLowerCase())
						.filter(ext => ext.length > 0);
					await this.plugin.saveSettings();
				}));

		// Statistics section
		containerEl.createEl('h2', { text: '库统计信息' });
		
		const statsContainer = containerEl.createDiv('quest-generator-stats');
		statsContainer.createEl('p', { text: '加载统计信息中...' });
		
		// Load and display vault statistics
		this.loadVaultStats(statsContainer);
	}

	private async loadVaultStats(container: HTMLElement) {
		try {
			const noteSelector = new NoteSelector(this.app, this.plugin.settings.noteSelectorOptions);
			const stats = await noteSelector.getVaultStats();
			
			container.empty();
			
			const statsGrid = container.createDiv('stats-grid');
			
			const createStatItem = (label: string, value: string | number) => {
				const item = statsGrid.createDiv('stat-item');
				item.createEl('div', { text: value.toString(), cls: 'stat-value' });
				item.createEl('div', { text: label, cls: 'stat-label' });
			};
			
			createStatItem('总文件数', stats.totalFiles);
			createStatItem('符合条件的文件', stats.eligibleFiles);
			createStatItem('总词数', stats.totalWordCount.toLocaleString());
			createStatItem('平均词数', stats.averageWordCount);
			
			if (Object.keys(stats.folderDistribution).length > 0) {
				container.createEl('h4', { text: '文件夹分布' });
				const folderList = container.createDiv('folder-distribution');
				
				Object.entries(stats.folderDistribution)
					.sort(([,a], [,b]) => b - a)
					.slice(0, 10) // Show top 10 folders
					.forEach(([folder, count]) => {
						const item = folderList.createDiv('folder-item');
						item.createEl('span', { text: folder || 'Root', cls: 'folder-name' });
						item.createEl('span', { text: count.toString(), cls: 'folder-count' });
					});
			}
			
		} catch (error) {
			console.error('Error loading vault stats:', error);
			container.empty();
			container.createEl('p', { text: '加载统计信息失败', cls: 'error-message' });
		}
	}
}