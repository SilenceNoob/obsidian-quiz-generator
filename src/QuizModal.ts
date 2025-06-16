import { App, Modal, Setting, ButtonComponent } from 'obsidian';
import { Question } from './QuestionGenerator';

export interface QuizResult {
	score: number;
	totalQuestions: number;
	percentage: number;
	questions: Question[];
}

export class QuizModal extends Modal {
	private questions: Question[];
	private currentQuestionIndex: number = 0;
	private userAnswers: Map<string, number[]> = new Map();
	private onComplete: (result: QuizResult) => void;
	private startTime: number;
	private modalSize: { width: number; height: number };

	constructor(
		app: App,
		questions: Question[],
		onComplete: (result: QuizResult) => void,
		modalSize: { width: number; height: number }
	) {
		super(app);
		this.questions = questions;
		this.onComplete = onComplete;
		this.startTime = Date.now();
		this.modalSize = modalSize;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('quiz-modal');
		contentEl.addClass('modal-content');

		// 设置模态框大小
		this.modalEl.style.width = `${this.modalSize.width}px`;
		this.modalEl.style.height = `${this.modalSize.height}px`;
		this.modalEl.style.maxWidth = `${this.modalSize.width}px`;
		this.modalEl.style.maxHeight = `${this.modalSize.height}px`;

		if (this.questions.length === 0) {
			contentEl.createEl('h2', { text: '没有生成题目' });
			contentEl.createEl('p', { text: '请检查设置并重试。' });
			return;
		}

		this.renderQuestion();
	}

	private renderQuestion() {
		const { contentEl } = this;
		contentEl.empty();

		const question = this.questions[this.currentQuestionIndex];
		const progress = this.currentQuestionIndex + 1;
		const total = this.questions.length;

		// Header
		const header = contentEl.createDiv('quiz-header');
		header.createEl('h2', { text: `题目 ${progress} / ${total}` });
		
		// Progress bar
		const progressContainer = header.createDiv('quiz-progress-container');
		const progressBar = progressContainer.createDiv('quiz-progress-bar');
		progressBar.style.width = `${(progress / total) * 100}%`;

		// Question type badge
		const typeBadge = header.createDiv('quiz-type-badge');
		const typeText = this.getQuestionTypeText(question.type);
		typeBadge.setText(typeText);
		typeBadge.addClass(`quiz-type-${question.type}`);

		// Question content
		const questionContainer = contentEl.createDiv('quiz-question-container');
		questionContainer.createEl('h3', { 
			text: question.question,
			cls: 'quiz-question-text'
		});

		// Options
		const optionsContainer = questionContainer.createDiv('quiz-options-container');
		const currentAnswers = this.userAnswers.get(question.id) || [];

		question.options.forEach((option, index) => {
			const optionContainer = optionsContainer.createDiv('quiz-option');
			
			const input = optionContainer.createEl('input');
			input.type = question.type === 'multiple_answer' ? 'checkbox' : 'radio';
			input.name = `question_${question.id}`;
			input.value = index.toString();
			input.id = `option_${question.id}_${index}`;
			input.checked = currentAnswers.includes(index);

			const label = optionContainer.createEl('label');
			label.htmlFor = input.id;
			label.setText(option);

			input.addEventListener('change', () => {
				this.handleAnswerChange(question.id, index, input.checked, question.type);
			});
		});

		// Navigation buttons
		const buttonContainer = contentEl.createDiv('quiz-button-container');

		if (this.currentQuestionIndex > 0) {
			new ButtonComponent(buttonContainer)
				.setButtonText('上一题')
				.setCta()
				.onClick(() => {
					this.currentQuestionIndex--;
					this.renderQuestion();
				});
		}

		if (this.currentQuestionIndex < this.questions.length - 1) {
			new ButtonComponent(buttonContainer)
				.setButtonText('下一题')
				.setCta()
				.onClick(() => {
					this.currentQuestionIndex++;
					this.renderQuestion();
				});
		} else {
			new ButtonComponent(buttonContainer)
				.setButtonText('完成测验')
				.setCta()
				.onClick(() => {
					this.completeQuiz();
				});
		}

		// Skip button
		new ButtonComponent(buttonContainer)
			.setButtonText('跳过')
			.onClick(() => {
				if (this.currentQuestionIndex < this.questions.length - 1) {
					this.currentQuestionIndex++;
					this.renderQuestion();
				} else {
					this.completeQuiz();
				}
			});
	}

	private handleAnswerChange(
		questionId: string,
		optionIndex: number,
		isChecked: boolean,
		questionType: string
	) {
		let currentAnswers = this.userAnswers.get(questionId) || [];

		if (questionType === 'multiple_answer') {
			if (isChecked) {
				if (!currentAnswers.includes(optionIndex)) {
					currentAnswers.push(optionIndex);
				}
			} else {
				currentAnswers = currentAnswers.filter(index => index !== optionIndex);
			}
		} else {
			// Single choice (radio button)
			currentAnswers = isChecked ? [optionIndex] : [];
		}

		this.userAnswers.set(questionId, currentAnswers);
	}

	private completeQuiz() {
		// Calculate score
		let correctCount = 0;
		
		this.questions.forEach(question => {
			const userAnswer = this.userAnswers.get(question.id) || [];
			question.userAnswer = userAnswer;
			
			// Check if answer is correct
			if (this.isAnswerCorrect(userAnswer, question.correct)) {
				correctCount++;
			}
		});

		const result: QuizResult = {
			score: correctCount,
			totalQuestions: this.questions.length,
			percentage: Math.round((correctCount / this.questions.length) * 100),
			questions: this.questions
		};

		this.close();
		this.onComplete(result);
	}

	private isAnswerCorrect(userAnswer: number[], correctAnswer: number[]): boolean {
		if (userAnswer.length !== correctAnswer.length) {
			return false;
		}

		// Sort both arrays to compare
		const sortedUser = [...userAnswer].sort((a, b) => a - b);
		const sortedCorrect = [...correctAnswer].sort((a, b) => a - b);

		return sortedUser.every((answer, index) => answer === sortedCorrect[index]);
	}

	private getQuestionTypeText(type: string): string {
		switch (type) {
			case 'multiple_choice':
				return '单选题';
			case 'multiple_answer':
				return '多选题';
			case 'true_false':
				return '判断题';
			default:
				return '未知题型';
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}