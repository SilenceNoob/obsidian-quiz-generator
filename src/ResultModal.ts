import { App, Modal, ButtonComponent } from 'obsidian';
import { QuizResult } from './QuizModal';
import { Question, QuestionGenerator } from './QuestionGenerator';
import { StatisticsModal } from './StatisticsModal';
import { ScoreManager } from './ScoreManager';

export class ResultModal extends Modal {
	private result: QuizResult;
	private currentQuestionIndex: number = 0;
	private showingResults: boolean = true;
	private modalSize: { width: number; height: number };
	private scoreManager: ScoreManager;
	private questionGenerator?: QuestionGenerator;

	constructor(app: App, result: QuizResult, modalSize: { width: number; height: number }, scoreManager: ScoreManager, questionGenerator?: QuestionGenerator) {
		super(app);
		this.result = result;
		this.modalSize = modalSize;
		this.scoreManager = scoreManager;
		this.questionGenerator = questionGenerator;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('result-modal');
		contentEl.addClass('modal-content');

		// 设置模态框大小
		this.modalEl.style.width = `${this.modalSize.width}px`;
		this.modalEl.style.height = `${this.modalSize.height}px`;
		this.modalEl.style.maxWidth = `${this.modalSize.width}px`;
		this.modalEl.style.maxHeight = `${this.modalSize.height}px`;

		if (this.showingResults) {
			this.renderOverallResults();
		} else {
			this.renderQuestionDetail();
		}
	}

	private renderOverallResults() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('result-modal');
		contentEl.addClass('modal-content');

		// Header
		const header = contentEl.createDiv('result-header');
		header.createEl('h2', { text: '测验结果' });

		// Score display
		const scoreContainer = contentEl.createDiv('result-score-container');
		
		const scoreCircle = scoreContainer.createDiv('result-score-circle');
		const percentage = this.result.percentage;
		scoreCircle.addClass(this.getScoreClass(percentage));
		
		const scoreText = scoreCircle.createDiv('result-score-text');
		scoreText.createEl('div', { 
			text: `${percentage}%`,
			cls: 'result-percentage'
		});
		scoreText.createEl('div', { 
			text: `${this.result.score}/${this.result.totalQuestions}`,
			cls: 'result-fraction'
		});

		// Performance message
		const messageContainer = contentEl.createDiv('result-message-container');
		const message = this.getPerformanceMessage(percentage);
		messageContainer.createEl('p', { 
			text: message,
			cls: 'result-message'
		});

		// Statistics
		const statsContainer = contentEl.createDiv('result-stats-container');
		statsContainer.createEl('h3', { text: '详细统计' });

		const stats = this.calculateDetailedStats();
		const statsGrid = statsContainer.createDiv('result-stats-grid');

		Object.entries(stats).forEach(([key, value]) => {
			const statItem = statsGrid.createDiv('result-stat-item');
			statItem.createEl('div', { 
				text: value.toString(),
				cls: 'result-stat-value'
			});
			statItem.createEl('div', { 
				text: key,
				cls: 'result-stat-label'
			});
		});

		// Question summary
		const summaryContainer = contentEl.createDiv('result-summary-container');
		summaryContainer.createEl('h3', { text: '题目概览' });

		const questionList = summaryContainer.createDiv('result-question-list');
		this.result.questions.forEach((question, index) => {
			const questionItem = questionList.createDiv('result-question-item');
			const isCorrect = question.type === 'thinking' ? true : this.isQuestionCorrect(question); // 思考题不显示对错
			
			questionItem.addClass(isCorrect ? 'correct' : 'incorrect');
			
			const questionNumber = questionItem.createDiv('result-question-number');
			questionNumber.setText(`${index + 1}`);
			
			const questionPreview = questionItem.createDiv('result-question-preview');
			questionPreview.setText(this.truncateText(question.question, 60));
			
			const questionStatus = questionItem.createDiv('result-question-status');
			if (question.type === 'thinking') {
				questionStatus.setText('📝'); // 思考题显示笔记图标
			} else {
				questionStatus.setText(isCorrect ? '✓' : '✗');
			}
			
			questionItem.addEventListener('click', () => {
				this.currentQuestionIndex = index;
				this.showingResults = false;
				this.renderQuestionDetail();
			});
		});

		// Buttons
		const buttonContainer = contentEl.createDiv('result-button-container');
		
		new ButtonComponent(buttonContainer)
			.setButtonText('查看详细解析')
			.setCta()
			.onClick(() => {
				this.currentQuestionIndex = 0;
				this.showingResults = false;
				this.renderQuestionDetail();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('查看统计信息')
			.onClick(() => {
				this.openStatisticsModal();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('关闭')
			.onClick(() => {
				this.close();
			});
	}

	// 新增：获取AI评价的方法
	private async getAIEvaluation(question: Question, container: HTMLElement) {
		if (!this.questionGenerator || !question.userText) {
			return;
		}

		// 显示加载状态
		container.empty();
		container.createEl('p', { text: '正在生成 AI 评价，请稍候...' });

		try {
			const evaluation = await this.questionGenerator.evaluateThinkingAnswer(question, question.userText);
			question.aiEvaluation = evaluation;

			// 显示评价结果
			container.empty();
			container.createEl('h4', { text: 'AI 评价' });
			const evaluationDiv = container.createDiv('result-ai-evaluation');
			evaluationDiv.setText(evaluation);
		} catch (error) {
			console.error('获取AI评价失败:', error);
			container.empty();
			container.createEl('p', { text: 'AI 评价生成失败，请稍后重试。' });
			
			// 重新显示按钮
			new ButtonComponent(container)
				.setButtonText('重新获取 AI 评价')
				.setCta()
				.onClick(async () => {
					await this.getAIEvaluation(question, container);
				});
		}
	}

	private renderQuestionDetail() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('result-modal');
		contentEl.addClass('modal-content');

		const question = this.result.questions[this.currentQuestionIndex];
		const isCorrect = question.type === 'thinking' ? true : this.isQuestionCorrect(question);
		const progress = this.currentQuestionIndex + 1;
		const total = this.result.questions.length;

		// Header
		const header = contentEl.createDiv('result-detail-header');
		header.createEl('h2', { text: `题目解析 ${progress} / ${total}` });
		
		const statusBadge = header.createDiv('result-status-badge');
		if (question.type === 'thinking') {
			statusBadge.addClass('thinking');
			statusBadge.setText('思考题');
		} else {
			statusBadge.addClass(isCorrect ? 'correct' : 'incorrect');
			statusBadge.setText(isCorrect ? '答对了' : '答错了');
		}

		// Question
		const questionContainer = contentEl.createDiv('result-question-container');
		questionContainer.createEl('h3', { 
			text: question.question,
			cls: 'result-question-text'
		});

		// Options with answers (only for choice questions)
		if (question.type !== 'thinking') {
			const optionsContainer = questionContainer.createDiv('result-options-container');
			question.options.forEach((option, index) => {
				const optionItem = optionsContainer.createDiv('result-option-item');
				
				const isUserAnswer = (question.userAnswer || []).includes(index);
				const isCorrectAnswer = question.correct.includes(index);
				
				if (isCorrectAnswer) {
					optionItem.addClass('correct-answer');
				}
				if (isUserAnswer && !isCorrectAnswer) {
					optionItem.addClass('wrong-answer');
				}
				if (isUserAnswer && isCorrectAnswer) {
					optionItem.addClass('user-correct');
				}

				const optionLabel = optionItem.createDiv('result-option-label');
				optionLabel.setText(`${String.fromCharCode(65 + index)}. ${option}`);
				
				const optionStatus = optionItem.createDiv('result-option-status');
				if (isCorrectAnswer) {
					optionStatus.setText('✓ 正确答案');
				} else if (isUserAnswer) {
					optionStatus.setText('✗ 你的选择');
				}
			});
		}

		// User answer summary
		const answerSummary = contentEl.createDiv('result-answer-summary');
		
		if (question.type === 'thinking') {
			// 思考题：显示用户答案和AI评价
			answerSummary.createEl('h4', { text: '你的回答' });
			const userAnswerDiv = answerSummary.createDiv('result-thinking-answer');
			userAnswerDiv.setText(question.userText || '未作答');
			
			// AI评价按钮和显示区域
			if (question.userText && this.questionGenerator) {
				const evaluationContainer = answerSummary.createDiv('result-evaluation-container');
				
				if (question.aiEvaluation) {
					// 显示已有的AI评价
					evaluationContainer.createEl('h4', { text: 'AI 评价' });
					const evaluationDiv = evaluationContainer.createDiv('result-ai-evaluation');
					evaluationDiv.setText(question.aiEvaluation);
				} else {
					// 显示获取AI评价的按钮
					new ButtonComponent(evaluationContainer)
						.setButtonText('获取 AI 评价')
						.setCta()
						.onClick(async () => {
							await this.getAIEvaluation(question, evaluationContainer);
						});
				}
			}
		} else {
			// 选择题：显示选择答案
			const userAnswerText = this.getUserAnswerText(question);
			const correctAnswerText = this.getCorrectAnswerText(question);
			
			answerSummary.createEl('p', { 
				text: `你的答案：${userAnswerText}`,
				cls: 'result-user-answer'
			});
			answerSummary.createEl('p', { 
				text: `正确答案：${correctAnswerText}`,
				cls: 'result-correct-answer'
			});
		}

		// Explanation
		const explanationContainer = contentEl.createDiv('result-explanation-container');
		explanationContainer.createEl('h4', { text: '题目解析' });
		explanationContainer.createEl('p', { 
			text: question.explanation,
			cls: 'result-explanation-text'
		});

		// Navigation buttons
		const buttonContainer = contentEl.createDiv('result-button-container');

		new ButtonComponent(buttonContainer)
			.setButtonText('返回总览')
			.onClick(() => {
				this.showingResults = true;
				this.renderOverallResults();
			});

		if (this.currentQuestionIndex > 0) {
			new ButtonComponent(buttonContainer)
				.setButtonText('上一题')
				.onClick(() => {
					this.currentQuestionIndex--;
					this.renderQuestionDetail();
				});
		}

		if (this.currentQuestionIndex < this.result.questions.length - 1) {
			new ButtonComponent(buttonContainer)
				.setButtonText('下一题')
				.onClick(() => {
					this.currentQuestionIndex++;
					this.renderQuestionDetail();
				});
		}
	}

	private isQuestionCorrect(question: Question): boolean {
		// 思考题不参与正确性判断
		if (question.type === 'thinking') {
			return true;
		}
		
		const userAnswer = question.userAnswer || [];
		if (userAnswer.length !== question.correct.length) {
			return false;
		}
		const sortedUser = [...userAnswer].sort((a, b) => a - b);
		const sortedCorrect = [...question.correct].sort((a, b) => a - b);
		return sortedUser.every((answer, index) => answer === sortedCorrect[index]);
	}

	private getScoreClass(percentage: number): string {
		if (percentage >= 90) return 'excellent';
		if (percentage >= 80) return 'good';
		if (percentage >= 70) return 'average';
		if (percentage >= 60) return 'below-average';
		return 'poor';
	}

	private getPerformanceMessage(percentage: number): string {
		if (percentage >= 90) return '优秀！你对这个主题掌握得很好！';
		if (percentage >= 80) return '良好！继续保持这种学习状态！';
		if (percentage >= 70) return '不错！还有提升的空间。';
		if (percentage >= 60) return '及格了，但需要更多练习。';
		return '需要加强学习，建议重新复习相关内容。';
	}

	private calculateDetailedStats() {
		const stats: Record<string, number> = {
			'总题数': this.result.totalQuestions,
			'答对题数': this.result.score,
			'答错题数': this.result.totalQuestions - this.result.score
		};

		// Count by question type (exclude thinking questions from stats)
		const typeStats: Record<string, { total: number; correct: number }> = {};
		
		this.result.questions.forEach(question => {
			// 思考题不参与统计
			if (question.type === 'thinking') {
				return;
			}
			
			const typeKey = this.getQuestionTypeText(question.type);
			if (!typeStats[typeKey]) {
				typeStats[typeKey] = { total: 0, correct: 0 };
			}
			typeStats[typeKey].total++;
			if (this.isQuestionCorrect(question)) {
				typeStats[typeKey].correct++;
			}
		});

		Object.entries(typeStats).forEach(([type, data]) => {
			stats[`${type}正确率`] = Math.round((data.correct / data.total) * 100);
		});

		return stats;
	}

	private getQuestionTypeText(type: string): string {
		switch (type) {
			case 'multiple_choice': return '单选题';
			case 'multiple_answer': return '多选题';
			case 'true_false': return '判断题';
			case 'thinking': return '思考题';
			default: return '未知题型';
		}
	}

	private getUserAnswerText(question: Question): string {
		if (question.type === 'thinking') {
			return question.userText || '未作答';
		}
		
		const userAnswer = question.userAnswer || [];
		if (userAnswer.length === 0) return '未作答';
		return userAnswer.map(index => String.fromCharCode(65 + index)).join(', ');
	}

	private getCorrectAnswerText(question: Question): string {
		return question.correct.map(index => String.fromCharCode(65 + index)).join(', ');
	}

	private truncateText(text: string, maxLength: number): string {
		return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
	}

	private openStatisticsModal() {
		const statisticsModal = new StatisticsModal(this.app, this.scoreManager);
		statisticsModal.open();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}