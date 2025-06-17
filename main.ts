import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { DeepSeekAPI } from './src/DeepSeekAPI';
import { QuestionGenerator, QuestGeneratorSettings as QuizSettings, Question } from './src/QuestionGenerator';
import { NoteSelector, NoteSelectorOptions } from './src/NoteSelector';
import { QuizModal, QuizResult } from './src/QuizModal';
import { ResultModal } from './src/ResultModal';
import { ScoreManager } from './src/ScoreManager';
import { StatisticsModal } from './src/StatisticsModal';
import { NoteSelectionModal, SelectedNote } from './src/NoteSelectionModal';
import { ConfirmationModal } from './src/ConfirmationModal';

interface QuestGeneratorSettings {
	deepSeekApiKey: string;
	questionCount: number; // 保留用于向后兼容，但不再使用
	questionTypes: {
		multipleChoice: number;
		multipleAnswer: number;
		trueFalse: number;
		thinking: number;
	};
	difficulty: 'easy' | 'medium' | 'hard';
	noteSelectorOptions: NoteSelectorOptions;
	modalSize: {
		width: number;
		height: number;
	};
	statisticsModalSize: {
		width: number;
		height: number;
	};
	maxQuestionsPerBatch: number; // 每批次最大题目数量
}

const DEFAULT_SETTINGS: QuestGeneratorSettings = {
	deepSeekApiKey: '',
	questionCount: 5, // 保留用于向后兼容
	questionTypes: {
		multipleChoice: 2,
		multipleAnswer: 2,
		trueFalse: 1,
		thinking: 1
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
	},
	statisticsModalSize: {
		width: 1200,
		height: 900
	},
	maxQuestionsPerBatch: 10
};

export default class QuestGeneratorPlugin extends Plugin {
	settings: QuestGeneratorSettings;
	private deepSeekAPI: DeepSeekAPI;
	private questionGenerator: QuestionGenerator;
	private noteSelector: NoteSelector;
	scoreManager: ScoreManager;

	async onload() {
		await this.loadSettings();

		// Initialize components
		this.deepSeekAPI = new DeepSeekAPI(this.settings.deepSeekApiKey);
		this.questionGenerator = new QuestionGenerator(this.deepSeekAPI);
		this.noteSelector = new NoteSelector(this.app, this.settings.noteSelectorOptions);
		this.scoreManager = new ScoreManager(this.app);

		// Add ribbon icon
		const ribbonIconEl = this.addRibbonIcon('brain', '生成测验题', async (evt: MouseEvent) => {
			this.openNoteSelectionModal();
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

	private openNoteSelectionModal() {
		if (!this.validateSettings()) {
			return;
		}

		const modal = new NoteSelectionModal(
			this.app,
			this.settings.noteSelectorOptions,
			async (selectedNote: SelectedNote) => {
				await this.generateQuizFromNote(selectedNote.path, selectedNote.content, selectedNote.title);
			}
		);
		modal.open();
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

			new Notice(`已选择笔记：${selectedNote.file.basename}`);
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
			// 按题型分别生成题目
			const allQuestions = await this.generateQuestionsByType(
				content,
				displayTitle || title,
				this.settings
			);

			const questions = allQuestions;

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

	private async generateQuestionsByType(
		content: string,
		title: string,
		settings: QuestGeneratorSettings
	): Promise<Question[]> {
		const allQuestions: Question[] = [];
		const questionTypes = [
			{ type: 'multipleChoice', count: settings.questionTypes.multipleChoice, name: '单选题' },
			{ type: 'multipleAnswer', count: settings.questionTypes.multipleAnswer, name: '多选题' },
			{ type: 'trueFalse', count: settings.questionTypes.trueFalse, name: '判断题' },
			{ type: 'thinking', count: settings.questionTypes.thinking, name: '思考题' }
		];

		for (const questionType of questionTypes) {
			if (questionType.count > 0) {
				const questions = await this.generateQuestionsForType(
				content,
				title,
				questionType.type,
				questionType.count,
				settings.difficulty,
				settings.maxQuestionsPerBatch
			);
				allQuestions.push(...questions);
				new Notice(`✅ 已生成 ${questions.length} 道${questionType.name}`);
			}
		}

		return allQuestions;
	}

	private async generateQuestionsForType(
		content: string,
		title: string,
		questionType: string,
		totalCount: number,
		difficulty: 'easy' | 'medium' | 'hard',
		maxPerBatch: number
	): Promise<Question[]> {
		const allQuestions: Question[] = [];
		let remainingCount = totalCount;

		while (remainingCount > 0) {
			const batchSize = Math.min(remainingCount, maxPerBatch);
			
			// 构建只包含当前题型的设置
			const batchSettings: QuizSettings = {
				questionCount: batchSize,
				questionTypes: {
					multipleChoice: questionType === 'multipleChoice' ? batchSize : 0,
					multipleAnswer: questionType === 'multipleAnswer' ? batchSize : 0,
					trueFalse: questionType === 'trueFalse' ? batchSize : 0,
					thinking: questionType === 'thinking' ? batchSize : 0
				},
				difficulty: difficulty,
				maxQuestionsPerBatch: maxPerBatch
			};

			try {
				// 将题型名称转换为API期望的格式
				const apiQuestionType = questionType === 'multipleChoice' ? 'multiple_choice' :
										questionType === 'multipleAnswer' ? 'multiple_answer' :
										questionType === 'trueFalse' ? 'true_false' : 'thinking';
				
				const batchQuestions = await this.questionGenerator.generateQuestions(
					content,
					title,
					batchSettings,
					apiQuestionType,
					batchSize
				);
				allQuestions.push(...batchQuestions);
				remainingCount -= batchQuestions.length;
				
				// 如果生成的题目数量少于预期，可能是内容不足，停止继续生成
				if (batchQuestions.length < batchSize && batchQuestions.length > 0) {
					console.warn(`题型 ${questionType} 只生成了 ${batchQuestions.length} 道题目，少于预期的 ${batchSize} 道`);
					break;
				}
				
				// 如果没有生成任何题目，停止继续尝试
				if (batchQuestions.length === 0) {
					console.warn(`题型 ${questionType} 无法生成题目，跳过剩余 ${remainingCount} 道`);
					break;
				}
			} catch (error) {
				console.error(`生成题型 ${questionType} 时出错:`, error);
				break;
			}
		}

		return allQuestions;
	}

	private async showQuizResult(result: QuizResult, noteTitle: string) {
		// 记录分数到笔记元数据
		await this.scoreManager.recordScore(noteTitle, result);
		
		// 显示结果
		const resultModal = new ResultModal(this.app, result, this.settings.modalSize, this.scoreManager, this, this.questionGenerator);
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

		const totalQuestions = this.settings.questionTypes.multipleChoice + 
							 this.settings.questionTypes.multipleAnswer + 
							 this.settings.questionTypes.trueFalse +
							 this.settings.questionTypes.thinking;
		
		if (totalQuestions === 0) {
			new Notice('请至少设置一种题目类型的数量大于0。');
			return false;
		}

		if (totalQuestions > 100) {
			new Notice('题目总数量不能超过100道。');
			return false;
		}

		return true;
	}

	async showStatistics() {
		const statisticsModal = new StatisticsModal(this.app, this.scoreManager, this.settings.statisticsModalSize);
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

		// 数据管理
		containerEl.createEl('h2', { text: '数据管理' });

		new Setting(containerEl)
			.setName('清空历史分数')
			.setDesc('⚠️ 清空所有笔记的测验记录和分数信息，此操作不可撤销')
			.addButton(button => button
				.setButtonText('清空所有记录')
				.setWarning()
				.onClick(async () => {
					const confirmModal = new ConfirmationModal(
						this.app,
						'确认清空历史分数',
						'您确定要清空所有笔记的测验记录吗？\n\n此操作将删除：\n• 所有测验分数\n• 平均分数\n• 尝试次数\n• 最后尝试时间\n\n此操作不可撤销！',
						async () => {
							button.setButtonText('清空中...');
							button.setDisabled(true);
							try {
								await this.plugin.scoreManager.clearAllScores();
							} finally {
								button.setButtonText('清空所有记录');
								button.setDisabled(false);
							}
						},
						'确认清空',
						'取消'
					);
					confirmModal.open();
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
			.setName('统计模态框宽度')
			.setDesc('统计信息模态框的宽度（像素，800-1600）')
			.addSlider(slider => slider
				.setLimits(800, 1600, 50)
				.setValue(this.plugin.settings.statisticsModalSize.width)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.statisticsModalSize.width = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('统计模态框高度')
			.setDesc('统计信息模态框的高度（像素，600-1200）')
			.addSlider(slider => slider
				.setLimits(600, 1200, 50)
				.setValue(this.plugin.settings.statisticsModalSize.height)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.statisticsModalSize.height = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('每批次最大题目数量')
			.setDesc('单次API调用生成的最大题目数量，避免超出token限制（1-20）')
			.addSlider(slider => slider
				.setLimits(1, 20, 1)
				.setValue(this.plugin.settings.maxQuestionsPerBatch)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maxQuestionsPerBatch = value;
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
		containerEl.createEl('h3', { text: '题目类型数量配置' });
		containerEl.createEl('p', { 
			text: '设置每种题型要生成的数量，设为0表示不生成该类型题目',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('单选题数量')
			.setDesc('生成单选题的数量（0-10，4个选项，1个正确答案）')
			.addSlider(slider => slider
				.setLimits(0, 10, 1)
				.setValue(this.plugin.settings.questionTypes.multipleChoice)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.questionTypes.multipleChoice = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('多选题数量')
			.setDesc('生成多选题的数量（0-10，4-6个选项，2-3个正确答案）')
			.addSlider(slider => slider
				.setLimits(0, 10, 1)
				.setValue(this.plugin.settings.questionTypes.multipleAnswer)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.questionTypes.multipleAnswer = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('判断题数量')
			.setDesc('生成判断题的数量（0-10，正确/错误）')
			.addSlider(slider => slider
				.setLimits(0, 10, 1)
				.setValue(this.plugin.settings.questionTypes.trueFalse)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.questionTypes.trueFalse = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('思考题数量')
			.setDesc('生成思考题的数量（0-5，开放性问题，需要深入思考和分析）')
			.addSlider(slider => slider
				.setLimits(0, 5, 1)
				.setValue(this.plugin.settings.questionTypes.thinking)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.questionTypes.thinking = value;
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
			
			// 文件夹分布功能已隐藏
			// if (Object.keys(stats.folderDistribution).length > 0) {
			// 	container.createEl('h4', { text: '文件夹分布' });
			// 	container.createEl('p', { 
			// 		text: '显示符合生成题目条件的笔记在各文件夹中的分布情况，按笔记数量排序（最多显示前10个文件夹）',
			// 		cls: 'setting-item-description'
			// 	});
			// 	const folderList = container.createDiv('folder-distribution');
			// 	
			// 	Object.entries(stats.folderDistribution)
			// 		.sort(([,a], [,b]) => b - a)
			// 		.slice(0, 10) // Show top 10 folders
			// 		.forEach(([folder, count]) => {
			// 			const item = folderList.createDiv('folder-item');
			// 			item.createEl('span', { text: folder || 'Root', cls: 'folder-name' });
			// 			item.createEl('span', { text: count.toString(), cls: 'folder-count' });
			// 		});
			// }
			
		} catch (error) {
			console.error('Error loading vault stats:', error);
			container.empty();
			container.createEl('p', { text: '加载统计信息失败', cls: 'error-message' });
		}

		// 赞助信息
		this.containerEl.createEl('h2', { text: '支持开发' });
		
		const supportContainer = this.containerEl.createDiv('support-section');
		supportContainer.createEl('p', {
			text: '如果这个插件对您有帮助，欢迎支持开发者继续改进和维护！',
			cls: 'setting-item-description'
		});

		// Ko-fi 赞助
		const kofiContainer = supportContainer.createDiv('kofi-container');
		const kofiLink = kofiContainer.createEl('a', {
			href: 'https://ko-fi.com/zzxxh',
			text: '☕ Support me on Ko-fi',
			cls: 'kofi-link'
		});
		kofiLink.setAttribute('target', '_blank');
		kofiLink.setAttribute('rel', 'noopener noreferrer');

		// B站充电
		const bilibiliContainer = supportContainer.createDiv('bilibili-container');
		const bilibiliLink = bilibiliContainer.createEl('a', {
			href: 'https://space.bilibili.com/19131632',
			text: '⚡ B站充电支持',
			cls: 'bilibili-link'
		});
		bilibiliLink.setAttribute('target', '_blank');
		bilibiliLink.setAttribute('rel', 'noopener noreferrer');



		supportContainer.createEl('p', {
			text: '您的支持是我持续开发的动力，感谢！',
			cls: 'setting-item-description support-thanks'
		});
	}
}