import { App, TFile, Notice } from 'obsidian';
import { QuizResult } from './QuizModal';

export interface NoteScore {
	notePath: string;
	noteTitle: string;
	scores: number[];
	averageScore: number;
	totalAttempts: number;
	lastAttempt: number; // timestamp
}

export interface ScoreStatistics {
	totalNotes: number;
	totalAttempts: number;
	overallAverage: number;
	noteScores: NoteScore[];
}

export class ScoreManager {
	private app: App;
	private readonly SCORE_METADATA_KEY = 'quiz-scores';
	private readonly AVERAGE_METADATA_KEY = 'quiz-average';
	private readonly ATTEMPTS_METADATA_KEY = 'quiz-attempts';
	private readonly LAST_ATTEMPT_KEY = 'quiz-last-attempt';

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 记录测验结果到笔记元数据
	 */
	async recordScore(noteTitle: string, result: QuizResult): Promise<void> {
		try {
			const file = await this.findNoteByTitle(noteTitle);
			if (!file) {
				console.log(`调试信息: 尝试查找笔记 "${noteTitle}"`);
				const allFiles = this.app.vault.getMarkdownFiles();
				console.log(`当前vault中的所有Markdown文件:`, allFiles.map(f => f.basename));
				new Notice(`找不到笔记: ${noteTitle}。请确保笔记文件存在于当前vault中。`);
				return;
			}

			// 读取当前文件内容
			const content = await this.app.vault.read(file);
			const { frontmatter, body } = this.parseFrontmatter(content);

			// 获取现有分数
			const existingScores: number[] = frontmatter[this.SCORE_METADATA_KEY] || [];
			
			// 添加新分数
			existingScores.push(result.percentage);

			// 计算平均分
			const averageScore = this.calculateAverage(existingScores);

			// 更新元数据
			frontmatter[this.SCORE_METADATA_KEY] = existingScores;
			frontmatter[this.AVERAGE_METADATA_KEY] = Math.round(averageScore * 100) / 100;
			frontmatter[this.ATTEMPTS_METADATA_KEY] = existingScores.length;
			frontmatter[this.LAST_ATTEMPT_KEY] = new Date().toISOString();

			// 写回文件
			const newContent = this.buildContentWithFrontmatter(frontmatter, body);
			await this.app.vault.modify(file, newContent);

			new Notice(`测验分数已记录到笔记 "${noteTitle}" (平均分: ${frontmatter[this.AVERAGE_METADATA_KEY]}%)`);
			
		} catch (error) {
			console.error('记录分数时出错:', error);
			new Notice('记录分数失败，请查看控制台了解详情。');
		}
	}

	/**
	 * 获取所有笔记的测验统计信息
	 */
	async getScoreStatistics(): Promise<ScoreStatistics> {
		const noteScores: NoteScore[] = [];
		let totalAttempts = 0;
		let totalScore = 0;

		const markdownFiles = this.app.vault.getMarkdownFiles();
		
		for (const file of markdownFiles) {
			try {
				const content = await this.app.vault.read(file);
				const { frontmatter } = this.parseFrontmatter(content);

				const scores: number[] = frontmatter[this.SCORE_METADATA_KEY];
				if (scores && scores.length > 0) {
					const averageScore = this.calculateAverage(scores);
					const lastAttempt = frontmatter[this.LAST_ATTEMPT_KEY] ? 
						new Date(frontmatter[this.LAST_ATTEMPT_KEY]).getTime() : 0;

					noteScores.push({
						notePath: file.path,
						noteTitle: file.basename,
						scores: scores,
						averageScore: averageScore,
						totalAttempts: scores.length,
						lastAttempt: lastAttempt
					});

					totalAttempts += scores.length;
					totalScore += scores.reduce((sum, score) => sum + score, 0);
				}
			} catch (error) {
				console.warn(`读取文件 ${file.path} 时出错:`, error);
			}
		}

		// 按平均分降序排序
		noteScores.sort((a, b) => b.averageScore - a.averageScore);

		return {
			totalNotes: noteScores.length,
			totalAttempts: totalAttempts,
			overallAverage: totalAttempts > 0 ? totalScore / totalAttempts : 0,
			noteScores: noteScores
		};
	}

	/**
	 * 获取特定笔记的测验统计信息
	 */
	async getNoteScore(noteTitle: string): Promise<NoteScore | null> {
		const file = await this.findNoteByTitle(noteTitle);
		if (!file) {
			return null;
		}

		try {
			const content = await this.app.vault.read(file);
			const { frontmatter } = this.parseFrontmatter(content);

			const scores: number[] = frontmatter[this.SCORE_METADATA_KEY];
			if (!scores || scores.length === 0) {
				return null;
			}

			const averageScore = this.calculateAverage(scores);
			const lastAttempt = frontmatter[this.LAST_ATTEMPT_KEY] ? 
				new Date(frontmatter[this.LAST_ATTEMPT_KEY]).getTime() : 0;

			return {
				notePath: file.path,
				noteTitle: file.basename,
				scores: scores,
				averageScore: averageScore,
				totalAttempts: scores.length,
				lastAttempt: lastAttempt
			};
		} catch (error) {
			console.error(`获取笔记 ${noteTitle} 的分数时出错:`, error);
			return null;
		}
	}

	/**
	 * 清除特定笔记的测验记录
	 */
	async clearNoteScores(noteTitle: string): Promise<void> {
		const file = await this.findNoteByTitle(noteTitle);
		if (!file) {
			new Notice(`找不到笔记: ${noteTitle}`);
			return;
		}

		try {
			const content = await this.app.vault.read(file);
			const { frontmatter, body } = this.parseFrontmatter(content);

			// 删除测验相关的元数据
			delete frontmatter[this.SCORE_METADATA_KEY];
			delete frontmatter[this.AVERAGE_METADATA_KEY];
			delete frontmatter[this.ATTEMPTS_METADATA_KEY];
			delete frontmatter[this.LAST_ATTEMPT_KEY];

			// 写回文件
			const newContent = this.buildContentWithFrontmatter(frontmatter, body);
			await this.app.vault.modify(file, newContent);

			new Notice(`已清除笔记 "${noteTitle}" 的测验记录`);
		} catch (error) {
			console.error('清除分数记录时出错:', error);
			new Notice('清除记录失败，请查看控制台了解详情。');
		}
	}

	// 私有方法

	private async findNoteByTitle(title: string): Promise<TFile | null> {
		console.log(`调试信息: 开始查找笔记 "${title}"`);
		
		// 尝试多种可能的路径格式进行精确查找
		const possiblePaths = [
			title,
			`${title}.md`,
			title.endsWith('.md') ? title.slice(0, -3) : `${title}.md`
		];
		
		for (const path of possiblePaths) {
			console.log(`调试信息: 尝试路径 "${path}"`);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				console.log(`调试信息: 通过路径 "${path}" 找到文件`);
				return file;
			}
		}
		
		console.log(`调试信息: 精确路径查找失败，开始遍历所有文件`);
		
		// 如果精确查找失败，遍历所有 Markdown 文件进行匹配
		const allFiles = this.app.vault.getMarkdownFiles();
		console.log(`调试信息: 当前vault中共有 ${allFiles.length} 个Markdown文件`);
		
		// 首先尝试直接通过路径匹配
		for (const file of allFiles) {
			if (file.path === title) {
				console.log(`调试信息: 通过路径直接匹配找到文件 "${file.path}"`);
				return file;
			}
		}
		
		// 如果路径匹配失败，尝试通过文件名匹配（向后兼容）
		for (const file of allFiles) {
			console.log(`调试信息: 检查文件 "${file.path}" (basename: "${file.basename}")`);
			
			// 通过文件名匹配（不包含扩展名）
			if (file.basename === title) {
				console.log(`调试信息: 通过basename匹配找到文件 "${file.path}"`);
				return file;
			}
		}
		
		// 如果通过文件名没找到，尝试通过笔记内容中的标题匹配
		console.log(`调试信息: 文件名匹配失败，尝试通过笔记内容标题匹配`);
		
		for (const file of allFiles) {
			try {
				// 读取文件内容进行标题匹配
				const content = await this.app.vault.cachedRead(file);
				const extractedTitle = this.extractTitleFromFile(file, content);
				
				console.log(`调试信息: 文件 "${file.path}" 的提取标题: "${extractedTitle}"`);
				
				if (extractedTitle === title) {
					console.log(`调试信息: 通过内容标题匹配找到文件 "${file.path}"`);
					return file;
				}
			} catch (error) {
				console.log(`调试信息: 读取文件 "${file.path}" 时出错:`, error);
			}
		}
		
		console.log(`调试信息: 未找到匹配的笔记`);
		console.log(`调试信息: 搜索的标题: "${title}"`);
		console.log(`调试信息: 所有文件的basename:`, allFiles.map(f => f.basename));
		
		return null;
	}

	/**
	 * 从文件中提取标题（与 NoteSelector 中的 extractTitle 方法保持一致）
	 */
	private extractTitleFromFile(file: TFile, content: string): string {
		// 尝试从 frontmatter 中提取标题
		const frontmatterMatch = content.match(/^---[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/);
		if (frontmatterMatch) {
			return frontmatterMatch[1].trim();
		}

		// 尝试从第一个标题中提取
		const headingMatch = content.match(/^#\s+(.+)$/m);
		if (headingMatch) {
			return headingMatch[1].trim();
		}

		// 使用文件名（不包含扩展名）
		return file.basename;
	}
	
	private extractTitleFromContent(content: string): string {
		// 尝试从 frontmatter 提取标题
		const frontmatterMatch = content.match(/^---[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/);
		if (frontmatterMatch) {
			return frontmatterMatch[1].trim();
		}
		
		// 尝试从第一个标题提取
		const headingMatch = content.match(/^#\s+(.+)$/m);
		if (headingMatch) {
			return headingMatch[1].trim();
		}
		
		// 如果都没有，返回空字符串
		return '';
	}

	private calculateAverage(scores: number[]): number {
		if (scores.length === 0) return 0;
		return scores.reduce((sum, score) => sum + score, 0) / scores.length;
	}

	private parseFrontmatter(content: string): { frontmatter: any, body: string } {
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
		const match = content.match(frontmatterRegex);

		if (match) {
			try {
				// 直接使用简单解析，避免依赖当前活动文件的缓存
				return this.parseYamlFrontmatter(match[1], content.substring(match[0].length));
			} catch (error) {
				// 静默处理解析错误，返回空的 frontmatter
				return {
					frontmatter: {},
					body: content
				};
			}
		}

		return {
			frontmatter: {},
			body: content
		};
	}

	private parseYamlFrontmatter(yamlContent: string, body: string): { frontmatter: any, body: string } {
		const frontmatter: any = {};
		const lines = yamlContent.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;

			const colonIndex = trimmed.indexOf(':');
			if (colonIndex === -1) continue;

			const key = trimmed.substring(0, colonIndex).trim();
			const value = trimmed.substring(colonIndex + 1).trim();

			// 简单的类型推断
			if (value.startsWith('[') && value.endsWith(']')) {
				// 数组
				try {
					frontmatter[key] = JSON.parse(value);
				} catch {
					frontmatter[key] = value;
				}
			} else if (!isNaN(Number(value))) {
				// 数字
				frontmatter[key] = Number(value);
			} else if (value === 'true' || value === 'false') {
				// 布尔值
				frontmatter[key] = value === 'true';
			} else {
				// 字符串
				frontmatter[key] = value.replace(/^["']|["']$/g, '');
			}
		}

		return { frontmatter, body };
	}

	private buildContentWithFrontmatter(frontmatter: any, body: string): string {
		const frontmatterKeys = Object.keys(frontmatter);
		
		if (frontmatterKeys.length === 0) {
			return body;
		}

		let yamlContent = '---\n';
		
		for (const key of frontmatterKeys) {
			const value = frontmatter[key];
			if (Array.isArray(value)) {
				yamlContent += `${key}: ${JSON.stringify(value)}\n`;
			} else if (typeof value === 'string') {
				yamlContent += `${key}: "${value}"\n`;
			} else {
				yamlContent += `${key}: ${value}\n`;
			}
		}
		
		yamlContent += '---\n';
		
		return yamlContent + (body.startsWith('\n') ? body : '\n' + body);
	}
}