import { DeepSeekAPI } from './DeepSeekAPI';

export interface Question {
	id: string;
	type: 'multiple_choice' | 'multiple_answer' | 'true_false';
	question: string;
	options: string[];
	correct: number[];
	explanation: string;
	userAnswer?: number[];
}

export interface QuestGeneratorSettings {
	questionCount: number;
	questionTypes: {
		multipleChoice: boolean;
		multipleAnswer: boolean;
		trueFalse: boolean;
	};
	difficulty: 'easy' | 'medium' | 'hard';
}

export class QuestionGenerator {
	private deepSeekAPI: DeepSeekAPI;

	constructor(deepSeekAPI: DeepSeekAPI) {
		this.deepSeekAPI = deepSeekAPI;
	}

	async generateQuestions(
		content: string,
		title: string,
		settings: QuestGeneratorSettings
	): Promise<Question[]> {
		const prompt = this.buildPrompt(content, title, settings);
		
		try {
			const response = await this.deepSeekAPI.generateQuestions(prompt);
			const questions = this.parseResponse(response);
			return this.validateAndFilterQuestions(questions, settings);
		} catch (error) {
			console.error('Error generating questions:', error);
			throw error;
		}
	}

	private buildPrompt(content: string, title: string, settings: QuestGeneratorSettings): string {
		const enabledTypes = [];
		if (settings.questionTypes.multipleChoice) enabledTypes.push('单选题 (multiple_choice)');
		if (settings.questionTypes.multipleAnswer) enabledTypes.push('多选题 (multiple_answer)');
		if (settings.questionTypes.trueFalse) enabledTypes.push('判断题 (true_false)');

		const difficultyMap = {
			easy: '简单',
			medium: '中等',
			hard: '困难'
		};

		// Truncate content if too long to avoid token limits
		const maxContentLength = 3000;
		const truncatedContent = content.length > maxContentLength 
			? content.substring(0, maxContentLength) + '...'
			: content;

		return `请基于以下笔记内容生成 ${settings.questionCount} 道测试题。

笔记标题：${title}

笔记内容：
${truncatedContent}

要求：
1. 题目类型：${enabledTypes.join('、')}
2. 难度等级：${difficultyMap[settings.difficulty]}
3. 题目应该基于笔记内容，测试对关键概念、事实和理解的掌握
4. 每道题都要有详细的解析说明
5. 单选题有4个选项，只有1个正确答案
6. 多选题有4-6个选项，可能有2-3个正确答案
7. 判断题只有对错两个选项

请严格按照以下JSON格式返回，不要包含任何其他文本：

{
  "questions": [
    {
      "type": "multiple_choice",
      "question": "题目内容",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correct": [0],
      "explanation": "详细解析"
    },
    {
      "type": "multiple_answer",
      "question": "题目内容",
      "options": ["选项A", "选项B", "选项C", "选项D", "选项E"],
      "correct": [0, 2],
      "explanation": "详细解析"
    },
    {
      "type": "true_false",
      "question": "题目内容",
      "options": ["正确", "错误"],
      "correct": [0],
      "explanation": "详细解析"
    }
  ]
}`;
	}

	private parseResponse(response: string): Question[] {
		try {
			// Clean the response - remove any markdown formatting or extra text
			let cleanResponse = response.trim();
			
			// Find JSON content between curly braces
			const jsonStart = cleanResponse.indexOf('{');
			const jsonEnd = cleanResponse.lastIndexOf('}');
			
			if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
				cleanResponse = cleanResponse.substring(jsonStart, jsonEnd + 1);
			}

			const parsed = JSON.parse(cleanResponse);
			
			if (!parsed.questions || !Array.isArray(parsed.questions)) {
				throw new Error('Invalid response format: missing questions array');
			}

			return parsed.questions.map((q: any, index: number) => ({
				id: `q_${Date.now()}_${index}`,
				type: q.type,
				question: q.question,
				options: q.options,
				correct: q.correct,
				explanation: q.explanation
			}));

		} catch (error) {
			console.error('Error parsing response:', error);
			console.error('Raw response:', response);
			throw new Error('Failed to parse AI response. Please try again.');
		}
	}

	private validateAndFilterQuestions(questions: Question[], settings: QuestGeneratorSettings): Question[] {
		const validQuestions = questions.filter(q => this.isValidQuestion(q, settings));
		
		// Limit to requested count
		return validQuestions.slice(0, settings.questionCount);
	}

	private isValidQuestion(question: Question, settings: QuestGeneratorSettings): boolean {
		// Check if question type is enabled
		const typeEnabled = (
			(question.type === 'multiple_choice' && settings.questionTypes.multipleChoice) ||
			(question.type === 'multiple_answer' && settings.questionTypes.multipleAnswer) ||
			(question.type === 'true_false' && settings.questionTypes.trueFalse)
		);

		if (!typeEnabled) return false;

		// Basic validation
		if (!question.question || !question.options || !question.correct || !question.explanation) {
			return false;
		}

		// Validate options array
		if (!Array.isArray(question.options) || question.options.length < 2) {
			return false;
		}

		// Validate correct answers array
		if (!Array.isArray(question.correct) || question.correct.length === 0) {
			return false;
		}

		// Validate correct answer indices
		for (const correctIndex of question.correct) {
			if (correctIndex < 0 || correctIndex >= question.options.length) {
				return false;
			}
		}

		// Type-specific validation
		switch (question.type) {
			case 'multiple_choice':
				return question.correct.length === 1 && question.options.length >= 3;
				
			case 'multiple_answer':
				return question.correct.length >= 2 && question.options.length >= 4;
				
			case 'true_false':
				return question.correct.length === 1 && question.options.length === 2;
				
			default:
				return false;
		}
	}
}