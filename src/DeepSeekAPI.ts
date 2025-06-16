export class DeepSeekAPI {
	private apiKey: string;
	private baseUrl = 'https://api.deepseek.com/v1';

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	updateApiKey(apiKey: string) {
		this.apiKey = apiKey;
	}

	async generateQuestions(prompt: string): Promise<string> {
		if (!this.apiKey) {
			throw new Error('API key not set');
		}

		try {
			const response = await fetch(`${this.baseUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.apiKey}`
				},
				body: JSON.stringify({
					model: 'deepseek-chat',
					messages: [
						{
							role: 'system',
							content: 'You are an expert quiz generator. Generate high-quality quiz questions based on the provided content. Always respond with valid JSON format containing an array of questions.'
						},
						{
							role: 'user',
							content: prompt
						}
					],
					temperature: 0.7,
					max_tokens: 4000,
					stream: false
				})
			});

			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(`API request failed: ${response.status} - ${errorData}`);
			}

			const data = await response.json();
			
			if (!data.choices || !data.choices[0] || !data.choices[0].message) {
				throw new Error('Invalid response format from API');
			}

			return data.choices[0].message.content;

		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error('Unknown error occurred while calling DeepSeek API');
		}
	}

	// Test API connection
	async testConnection(): Promise<boolean> {
		try {
			const response = await this.generateQuestions(
				'Generate one simple test question about the color of the sky. Respond with JSON format: {"questions": [{"type": "multiple_choice", "question": "What color is the sky?", "options": ["Blue", "Red", "Green", "Yellow"], "correct": [0], "explanation": "The sky appears blue due to light scattering."}]}'
			);
			return response.length > 0;
		} catch (error) {
			console.error('API connection test failed:', error);
			return false;
		}
	}
}