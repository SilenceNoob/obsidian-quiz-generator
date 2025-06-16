import { DeepSeekAPI } from './DeepSeekAPI';

export interface Question {
	id: string;
	type: 'multiple_choice' | 'multiple_answer' | 'true_false' | 'thinking';
	question: string;
	options: string[];
	correct: number[];
	explanation: string;
	userAnswer?: number[];
	userText?: string; // 用于思考题的文本回答
	aiEvaluation?: string; // AI对思考题回答的评价
}

export interface QuestGeneratorSettings {
	questionCount: number;
	questionTypes: {
		multipleChoice: number;
		multipleAnswer: number;
		trueFalse: number;
		thinking: number;
	};
	difficulty: 'easy' | 'medium' | 'hard';
	maxQuestionsPerBatch: number;
}

export class QuestionGenerator {
	private deepSeekAPI: DeepSeekAPI;

	constructor(deepSeekAPI: DeepSeekAPI) {
		this.deepSeekAPI = deepSeekAPI;
	}

	// 新增：AI评价思考题答案的方法
	async evaluateThinkingAnswer(question: Question, userAnswer: string): Promise<string> {
		if (question.type !== 'thinking') {
			throw new Error('此方法仅适用于思考题');
		}

		const prompt = `请作为一名专业的教师，评价学生对以下思考题的回答。

题目：${question.question}

参考答案要点：${question.explanation}

学生回答：${userAnswer}

请从以下几个方面进行评价：
1. 理解准确性：学生是否正确理解了题目要求
2. 内容完整性：回答是否涵盖了关键要点
3. 逻辑清晰性：论述是否有逻辑性和条理性
4. 深度思考：是否体现了深入的思考和分析
5. 改进建议：具体的改进方向

请用中文直接给出建设性的评价文本，包括优点和不足，以及具体的改进建议。评价应该鼓励学生继续思考，同时指出可以提升的地方。

注意：请直接返回评价文本，不要使用 JSON 格式或其他结构化格式。`;

		try {
			const response = await this.deepSeekAPI.generateQuestions(prompt);
			
			// 直接返回 AI 的文本响应，不进行 JSON 解析
			return response.trim();
		} catch (error) {
			console.error('Error evaluating thinking answer:', error);
			return '评价生成失败，请稍后重试。';
		}
	}

	async generateQuestions(
		content: string,
		title: string,
		settings: QuestGeneratorSettings,
		questionType?: string,
		questionCount?: number
	): Promise<Question[]> {
		const prompt = this.buildPrompt(content, title, settings, questionType, questionCount);
		
		try {
			const response = await this.deepSeekAPI.generateQuestions(prompt);
			const questions = this.parseResponse(response);
			return this.validateAndFilterQuestions(questions, settings, questionType, questionCount);
		} catch (error) {
			console.error('Error generating questions:', error);
			throw error;
		}
	}

	private buildPrompt(content: string, title: string, settings: QuestGeneratorSettings, questionType?: string, questionCount?: number): string {
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

		// If specific question type and count are provided, generate only that type
		if (questionType && questionCount) {
			const typeMap: { [key: string]: string } = {
				multiple_choice: '单选题',
				multiple_answer: '多选题',
				true_false: '判断题',
				thinking: '思考题'
			};

			let exampleFormat = '';
			if (questionType === 'true_false') {
				exampleFormat = `
    {
      "type": "true_false",
      "question": "题目内容（陈述句形式）",
      "options": ["正确", "错误"],
      "correct": [0],
      "explanation": "详细解析说明为什么这个陈述是正确或错误的"
    }`;
			} else if (questionType === 'multiple_choice') {
				exampleFormat = `
    {
      "type": "multiple_choice",
      "question": "题目内容",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correct": [0],
      "explanation": "详细解析"
    }`;
			} else if (questionType === 'thinking') {
				exampleFormat = `
    {
      "type": "thinking",
      "question": "开放性思考题目，要求学生深入思考和分析",
      "options": [],
      "correct": [],
      "explanation": "参考答案要点和评分标准，包含关键概念和思路"
    }`;
			} else {
				exampleFormat = `
    {
      "type": "multiple_answer",
      "question": "题目内容",
      "options": ["选项A", "选项B", "选项C", "选项D", "选项E"],
      "correct": [0, 2],
      "explanation": "详细解析"
    }`;
			}

			return `请基于以下笔记内容生成 ${questionCount} 道 ${typeMap[questionType]} 测试题。

笔记标题：${title}

笔记内容：
${truncatedContent}

要求：
1. 题目类型：仅生成 ${typeMap[questionType]} (${questionType})
2. 难度等级：${difficultyMap[settings.difficulty]}
3. 题目应该基于笔记内容，测试对关键概念、事实和理解的掌握
4. 每道题都要有详细的解析说明
5. 单选题有4个选项，只有1个正确答案
6. 多选题有4-6个选项，可能有2-3个正确答案
7. 判断题必须是陈述句形式，只有"正确"和"错误"两个选项，correct数组中只能有一个索引值（0表示正确，1表示错误）
8. 思考题是开放性问题，不需要选项（options为空数组），correct为空数组，explanation包含参考答案要点和评分标准

请严格按照以下JSON格式返回，不要包含任何其他文本：

{
  "questions": [${exampleFormat}
  ]
}`;
		}

		// Legacy mode: build enabled question types list for mixed generation
		const enabledTypes: string[] = [];
		if (settings.questionTypes.multipleChoice) enabledTypes.push('单选题 (multiple_choice)');
		if (settings.questionTypes.multipleAnswer) enabledTypes.push('多选题 (multiple_answer)');
		if (settings.questionTypes.trueFalse) enabledTypes.push('判断题 (true_false)');
		if (settings.questionTypes.thinking) enabledTypes.push('思考题 (thinking)');

		return `请基于以下笔记内容生成 ${settings.questionCount || 5} 道测试题。

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
8. 思考题是开放性问题，不需要选项，要求深入思考和分析

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

	private validateAndFilterQuestions(questions: Question[], settings: QuestGeneratorSettings, questionType?: string, questionCount?: number): Question[] {
		const validQuestions: Question[] = [];
		
		for (const question of questions) {
			if (this.isValidQuestion(question, settings, questionType)) {
				validQuestions.push(question);
			} else {
				console.warn('Invalid question filtered out:', {
					type: question.type,
					question: question.question?.substring(0, 50) + '...',
					optionsLength: question.options?.length,
					options: question.options,
					correctLength: question.correct?.length,
					correct: question.correct
				});
			}
		}
		
		// Limit to requested count
		const targetCount = questionCount || settings.questionCount;
		return validQuestions.slice(0, targetCount);
	}

	private isValidQuestion(question: Question, settings: QuestGeneratorSettings, questionType?: string): boolean {
		// If specific question type is provided, only validate that type
		if (questionType) {
			if (question.type !== questionType) return false;
		} else {
			// Check if question type is enabled in settings
			const typeEnabled = (
				(question.type === 'multiple_choice' && settings.questionTypes.multipleChoice > 0) ||
				(question.type === 'multiple_answer' && settings.questionTypes.multipleAnswer > 0) ||
				(question.type === 'true_false' && settings.questionTypes.trueFalse > 0) ||
				(question.type === 'thinking' && settings.questionTypes.thinking > 0)
			);
			if (!typeEnabled) return false;
		}

		// Basic validation
		if (!question.question || !question.options || !question.correct || !question.explanation) {
			return false;
		}

		// For thinking questions, skip options and correct validation
		if (question.type === 'thinking') {
			// Thinking questions should have empty options and correct arrays
			return Array.isArray(question.options) && question.options.length === 0 &&
				   Array.isArray(question.correct) && question.correct.length === 0;
		}

		// Validate options array (for non-thinking questions)
		if (!Array.isArray(question.options) || question.options.length < 2) {
			return false;
		}

		// Validate correct answers array (for non-thinking questions)
		if (!Array.isArray(question.correct) || question.correct.length === 0) {
			return false;
		}

		// Validate correct answer indices (for non-thinking questions)
		for (const correctIndex of question.correct) {
			if (correctIndex < 0 || correctIndex >= question.options.length) {
				return false;
			}
		}

		// Type-specific validation for choice-based questions
		switch (question.type) {
			case 'multiple_choice':
				return question.correct.length === 1 && question.options.length >= 3;
				
			case 'multiple_answer':
				return question.correct.length >= 2 && question.options.length >= 4;
				
			case 'true_false':
				// 验证判断题格式：必须有2个选项，1个正确答案，且选项为"正确"和"错误"
				if (question.correct.length !== 1 || question.options.length !== 2) {
					return false;
				}
				// 检查选项是否包含"正确"和"错误"
				const hasCorrectOption = question.options.includes('正确') || question.options.includes('对') || question.options.includes('True');
				const hasWrongOption = question.options.includes('错误') || question.options.includes('错') || question.options.includes('False');
				return hasCorrectOption && hasWrongOption;
				
			default:
				return false;
		}
	}
}