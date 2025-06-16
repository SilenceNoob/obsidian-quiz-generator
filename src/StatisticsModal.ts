import { App, Modal, Setting, Notice } from 'obsidian';
import { ScoreManager, ScoreStatistics, NoteScore } from './ScoreManager';

export class StatisticsModal extends Modal {
	private scoreManager: ScoreManager;
	private statistics: ScoreStatistics | null = null;
	private currentView: 'overview' | 'details' = 'overview';
	private selectedNote: NoteScore | null = null;

	constructor(app: App, scoreManager: ScoreManager) {
		super(app);
		this.scoreManager = scoreManager;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.addClass('statistics-modal');

		// 设置模态框大小
		this.modalEl.style.width = '90vw';
		this.modalEl.style.height = '80vh';
		this.modalEl.style.maxWidth = '1000px';
		this.modalEl.style.maxHeight = '800px';

		// 加载统计数据
		await this.loadStatistics();
		
		// 渲染界面
		this.render();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async loadStatistics() {
		try {
			this.statistics = await this.scoreManager.getScoreStatistics();
		} catch (error) {
			console.error('加载统计数据失败:', error);
			new Notice('加载统计数据失败');
		}
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		if (!this.statistics) {
			contentEl.createEl('div', { 
				text: '加载统计数据失败',
				cls: 'statistics-error'
			});
			return;
		}

		// 标题和导航
		this.renderHeader(contentEl);

		// 根据当前视图渲染内容
		if (this.currentView === 'overview') {
			this.renderOverview(contentEl);
		} else {
			this.renderDetails(contentEl);
		}
	}

	private renderHeader(container: HTMLElement) {
		const header = container.createEl('div', { cls: 'statistics-header' });
		
		const title = header.createEl('h2', { 
			text: '测验统计',
			cls: 'statistics-title'
		});

		// 导航按钮
		const nav = header.createEl('div', { cls: 'statistics-nav' });
		
		const overviewBtn = nav.createEl('button', {
			text: '总览',
			cls: this.currentView === 'overview' ? 'nav-btn active' : 'nav-btn'
		});
		overviewBtn.onclick = () => {
			this.currentView = 'overview';
			this.render();
		};

		const detailsBtn = nav.createEl('button', {
			text: '详细信息',
			cls: this.currentView === 'details' ? 'nav-btn active' : 'nav-btn'
		});
		detailsBtn.onclick = () => {
			this.currentView = 'details';
			this.render();
		};

		// 刷新按钮
		const refreshBtn = nav.createEl('button', {
			text: '🔄',
			cls: 'refresh-btn'
		});
		refreshBtn.onclick = async () => {
			await this.loadStatistics();
			this.render();
			new Notice('统计数据已刷新');
		};
	}

	private renderOverview(container: HTMLElement) {
		if (!this.statistics) return;

		const overview = container.createEl('div', { cls: 'statistics-overview' });

		// 总体统计卡片
		const statsGrid = overview.createEl('div', { cls: 'stats-grid' });

		this.createStatCard(statsGrid, '📚', '已测试笔记', this.statistics.totalNotes.toString());
		this.createStatCard(statsGrid, '📝', '总测验次数', this.statistics.totalAttempts.toString());
		this.createStatCard(statsGrid, '📊', '总体平均分', `${Math.round(this.statistics.overallAverage)}%`);
		this.createStatCard(statsGrid, '⭐', '最高平均分', 
			this.statistics.noteScores.length > 0 ? 
				`${Math.round(this.statistics.noteScores[0].averageScore)}%` : 'N/A'
		);

		// 最近测试的笔记
		if (this.statistics.noteScores.length > 0) {
			const recentSection = overview.createEl('div', { cls: 'recent-section' });
			recentSection.createEl('h3', { text: '最近测试的笔记' });

			const recentNotes = [...this.statistics.noteScores]
				.sort((a, b) => b.lastAttempt - a.lastAttempt)
				.slice(0, 5);

			const recentList = recentSection.createEl('div', { cls: 'recent-list' });
			recentNotes.forEach(note => {
				const item = recentList.createEl('div', { cls: 'recent-item' });
				
				const info = item.createEl('div', { cls: 'recent-info' });
				info.createEl('div', { 
					text: note.noteTitle,
					cls: 'recent-title'
				});
				info.createEl('div', { 
					text: `平均分: ${Math.round(note.averageScore)}% (${note.totalAttempts}次)`,
					cls: 'recent-score'
				});
				
				const time = item.createEl('div', { 
					text: this.formatDate(note.lastAttempt),
					cls: 'recent-time'
				});
			});
		}

		// 成绩分布图表
		if (this.statistics.noteScores.length > 0) {
			this.renderScoreDistribution(overview);
		}
	}

	private renderDetails(container: HTMLElement) {
		if (!this.statistics) return;

		const details = container.createEl('div', { cls: 'statistics-details' });

		if (this.statistics.noteScores.length === 0) {
			details.createEl('div', {
				text: '还没有任何测验记录',
				cls: 'no-data'
			});
			return;
		}

		// 搜索框
		const searchContainer = details.createEl('div', { cls: 'search-container' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: '搜索笔记...',
			cls: 'search-input'
		});

		// 笔记列表
		const notesList = details.createEl('div', { cls: 'notes-list' });
		
		const renderNotesList = (filter: string = '') => {
			notesList.empty();
			
			const filteredNotes = this.statistics!.noteScores.filter(note => 
				note.noteTitle.toLowerCase().includes(filter.toLowerCase())
			);

			filteredNotes.forEach(note => {
				const noteItem = notesList.createEl('div', { cls: 'note-item' });
				
				const noteHeader = noteItem.createEl('div', { cls: 'note-header' });
				noteHeader.createEl('h4', { 
					text: note.noteTitle,
					cls: 'note-title'
				});
				
				const noteStats = noteItem.createEl('div', { cls: 'note-stats' });
				noteStats.createEl('span', {
					text: `平均分: ${Math.round(note.averageScore)}%`,
					cls: 'stat-item'
				});
				noteStats.createEl('span', {
					text: `测验次数: ${note.totalAttempts}`,
					cls: 'stat-item'
				});
				noteStats.createEl('span', {
					text: `最后测验: ${this.formatDate(note.lastAttempt)}`,
					cls: 'stat-item'
				});

				// 分数历史
				const scoresHistory = noteItem.createEl('div', { cls: 'scores-history' });
				scoresHistory.createEl('div', { 
					text: '分数历史:',
					cls: 'scores-label'
				});
				
				const scoresContainer = scoresHistory.createEl('div', { cls: 'scores-container' });
				note.scores.forEach((score, index) => {
					const scoreChip = scoresContainer.createEl('span', {
						text: `${Math.round(score)}%`,
						cls: `score-chip ${this.getScoreClass(score)}`
					});
					scoreChip.title = `第 ${index + 1} 次测验`;
				});

				// 操作按钮
				const actions = noteItem.createEl('div', { cls: 'note-actions' });
				
				const openBtn = actions.createEl('button', {
					text: '打开笔记',
					cls: 'action-btn'
				});
				openBtn.onclick = () => {
					this.openNote(note.notePath);
				};

				const clearBtn = actions.createEl('button', {
					text: '清除记录',
					cls: 'action-btn danger'
				});
				clearBtn.onclick = async () => {
					await this.clearNoteScores(note.noteTitle);
				};
			});
		};

		// 搜索功能
		searchInput.oninput = () => {
			renderNotesList(searchInput.value);
		};

		// 初始渲染
		renderNotesList();
	}

	private renderScoreDistribution(container: HTMLElement) {
		if (!this.statistics) return;

		const chartSection = container.createEl('div', { cls: 'chart-section' });
		chartSection.createEl('h3', { text: '成绩分布' });

		// 简单的条形图
		const ranges = [
			{ label: '90-100%', min: 90, max: 100, count: 0 },
			{ label: '80-89%', min: 80, max: 89, count: 0 },
			{ label: '70-79%', min: 70, max: 79, count: 0 },
			{ label: '60-69%', min: 60, max: 69, count: 0 },
			{ label: '0-59%', min: 0, max: 59, count: 0 }
		];

		// 统计各分数段的笔记数量
		this.statistics.noteScores.forEach(note => {
			const avg = note.averageScore;
			for (const range of ranges) {
				if (avg >= range.min && avg <= range.max) {
					range.count++;
					break;
				}
			}
		});

		const maxCount = Math.max(...ranges.map(r => r.count));
		const chart = chartSection.createEl('div', { cls: 'score-chart' });

		ranges.forEach(range => {
			const bar = chart.createEl('div', { cls: 'chart-bar' });
			
			const label = bar.createEl('div', { 
				text: range.label,
				cls: 'bar-label'
			});
			
			const barContainer = bar.createEl('div', { cls: 'bar-container' });
			const barFill = barContainer.createEl('div', { cls: 'bar-fill' });
			
			const percentage = maxCount > 0 ? (range.count / maxCount) * 100 : 0;
			barFill.style.width = `${percentage}%`;
			
			const count = bar.createEl('div', { 
				text: range.count.toString(),
				cls: 'bar-count'
			});
		});
	}

	private createStatCard(container: HTMLElement, icon: string, label: string, value: string) {
		const card = container.createEl('div', { cls: 'stat-card' });
		
		card.createEl('div', { 
			text: icon,
			cls: 'stat-icon'
		});
		
		const content = card.createEl('div', { cls: 'stat-content' });
		content.createEl('div', { 
			text: value,
			cls: 'stat-value'
		});
		content.createEl('div', { 
			text: label,
			cls: 'stat-label'
		});
	}

	private getScoreClass(score: number): string {
		if (score >= 90) return 'excellent';
		if (score >= 80) return 'good';
		if (score >= 70) return 'average';
		if (score >= 60) return 'below-average';
		return 'poor';
	}

	private formatDate(timestamp: number): string {
		if (!timestamp) return '未知';
		
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return '今天';
		} else if (diffDays === 1) {
			return '昨天';
		} else if (diffDays < 7) {
			return `${diffDays}天前`;
		} else {
			return date.toLocaleDateString('zh-CN');
		}
	}

	private async openNote(notePath: string) {
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (file) {
			await this.app.workspace.openLinkText(notePath, '', false);
			this.close();
		} else {
			new Notice('无法找到笔记文件');
		}
	}

	private async clearNoteScores(noteTitle: string) {
		const confirmed = confirm(`确定要清除笔记 "${noteTitle}" 的所有测验记录吗？`);
		if (confirmed) {
			await this.scoreManager.clearNoteScores(noteTitle);
			await this.loadStatistics();
			this.render();
		}
	}
}