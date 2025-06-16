import { App, TFile, TFolder } from 'obsidian';

export interface NoteInfo {
	file: TFile;
	title: string;
	content: string;
	wordCount: number;
	path: string;
}

export interface NoteSelectorOptions {
	minWordCount: number;
	excludeFolders: string[];
	includeSubfolders: boolean;
	fileExtensions: string[];
}

export class NoteSelector {
	private app: App;
	private options: NoteSelectorOptions;

	constructor(app: App, options: Partial<NoteSelectorOptions> = {}) {
		this.app = app;
		this.options = {
			minWordCount: 100,
			excludeFolders: ['.obsidian', '.trash'],
			includeSubfolders: true,
			fileExtensions: ['md'],
			...options
		};
	}

	/**
	 * Get all eligible notes from the vault
	 */
	async getAllEligibleNotes(): Promise<NoteInfo[]> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const eligibleNotes: NoteInfo[] = [];

		for (const file of allFiles) {
			if (this.isFileEligible(file)) {
				try {
					const noteInfo = await this.createNoteInfo(file);
					if (noteInfo && noteInfo.wordCount >= this.options.minWordCount) {
						eligibleNotes.push(noteInfo);
					}
				} catch (error) {
					console.warn(`Failed to process file ${file.path}:`, error);
				}
			}
		}

		return eligibleNotes;
	}

	/**
	 * Select a random note from eligible notes
	 */
	async selectRandomNote(): Promise<NoteInfo | null> {
		const eligibleNotes = await this.getAllEligibleNotes();
		
		if (eligibleNotes.length === 0) {
			return null;
		}

		const randomIndex = Math.floor(Math.random() * eligibleNotes.length);
		return eligibleNotes[randomIndex];
	}

	/**
	 * Select multiple random notes
	 */
	async selectRandomNotes(count: number): Promise<NoteInfo[]> {
		const eligibleNotes = await this.getAllEligibleNotes();
		
		if (eligibleNotes.length === 0) {
			return [];
		}

		// Shuffle array and take first 'count' items
		const shuffled = [...eligibleNotes].sort(() => 0.5 - Math.random());
		return shuffled.slice(0, Math.min(count, shuffled.length));
	}

	/**
	 * Get notes from a specific folder
	 */
	async getNotesFromFolder(folderPath: string): Promise<NoteInfo[]> {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		
		if (!folder || !(folder instanceof TFolder)) {
			return [];
		}

		const notes: NoteInfo[] = [];
		const files = this.options.includeSubfolders 
			? this.getAllFilesInFolder(folder)
			: folder.children.filter(child => child instanceof TFile) as TFile[];

		for (const file of files) {
			if (file instanceof TFile && this.isFileEligible(file)) {
				try {
					const noteInfo = await this.createNoteInfo(file);
					if (noteInfo && noteInfo.wordCount >= this.options.minWordCount) {
						notes.push(noteInfo);
					}
				} catch (error) {
					console.warn(`Failed to process file ${file.path}:`, error);
				}
			}
		}

		return notes;
	}

	/**
	 * Search notes by content or title
	 */
	async searchNotes(query: string): Promise<NoteInfo[]> {
		const allNotes = await this.getAllEligibleNotes();
		const searchTerm = query.toLowerCase();

		return allNotes.filter(note => 
			note.title.toLowerCase().includes(searchTerm) ||
			note.content.toLowerCase().includes(searchTerm)
		);
	}

	/**
	 * Get vault statistics
	 */
	async getVaultStats(): Promise<{
		totalFiles: number;
		eligibleFiles: number;
		totalWordCount: number;
		averageWordCount: number;
		folderDistribution: Record<string, number>;
	}> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const eligibleNotes = await this.getAllEligibleNotes();
		
		const totalWordCount = eligibleNotes.reduce((sum, note) => sum + note.wordCount, 0);
		const averageWordCount = eligibleNotes.length > 0 ? Math.round(totalWordCount / eligibleNotes.length) : 0;

		// Calculate folder distribution
		const folderDistribution: Record<string, number> = {};
		eligibleNotes.forEach(note => {
			const folderPath = note.file.parent?.path || 'Root';
			folderDistribution[folderPath] = (folderDistribution[folderPath] || 0) + 1;
		});

		return {
			totalFiles: allFiles.length,
			eligibleFiles: eligibleNotes.length,
			totalWordCount,
			averageWordCount,
			folderDistribution
		};
	}

	private isFileEligible(file: TFile): boolean {
		// Check file extension
		const extension = file.extension.toLowerCase();
		if (!this.options.fileExtensions.includes(extension)) {
			return false;
		}

		// Check if file is in excluded folder
		for (const excludedFolder of this.options.excludeFolders) {
			if (file.path.startsWith(excludedFolder + '/') || file.path === excludedFolder) {
				return false;
			}
		}

		return true;
	}

	private async createNoteInfo(file: TFile): Promise<NoteInfo | null> {
		try {
			const content = await this.app.vault.read(file);
			const cleanContent = this.cleanContent(content);
			const wordCount = this.countWords(cleanContent);
			const title = this.extractTitle(file, content);

			return {
				file,
				title,
				content: cleanContent,
				wordCount,
				path: file.path
			};
		} catch (error) {
			console.error(`Error reading file ${file.path}:`, error);
			return null;
		}
	}

	private cleanContent(content: string): string {
		// Remove frontmatter
		content = content.replace(/^---[\s\S]*?---\n?/, '');
		
		// Remove markdown syntax but keep the text
		content = content
			// Remove headers
			.replace(/^#{1,6}\s+/gm, '')
			// Remove bold/italic
			.replace(/\*\*([^*]+)\*\*/g, '$1')
			.replace(/\*([^*]+)\*/g, '$1')
			.replace(/__([^_]+)__/g, '$1')
			.replace(/_([^_]+)_/g, '$1')
			// Remove links but keep text
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/\[\[([^\]]+)\]\]/g, '$1')
			// Remove code blocks
			.replace(/```[\s\S]*?```/g, '')
			.replace(/`([^`]+)`/g, '$1')
			// Remove images
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
			// Remove horizontal rules
			.replace(/^---+$/gm, '')
			// Remove blockquotes
			.replace(/^>\s+/gm, '')
			// Remove list markers
			.replace(/^[\s]*[-*+]\s+/gm, '')
			.replace(/^[\s]*\d+\.\s+/gm, '')
			// Remove extra whitespace
			.replace(/\n\s*\n/g, '\n')
			.trim();

		return content;
	}

	private countWords(content: string): number {
		if (!content.trim()) return 0;
		
		// Split by whitespace and filter out empty strings
		const words = content
			.split(/\s+/)
			.filter(word => word.length > 0);
		
		return words.length;
	}

	private extractTitle(file: TFile, content: string): string {
		// Try to extract title from frontmatter
		const frontmatterMatch = content.match(/^---[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/);
		if (frontmatterMatch) {
			return frontmatterMatch[1].trim();
		}

		// Try to extract from first heading
		const headingMatch = content.match(/^#\s+(.+)$/m);
		if (headingMatch) {
			return headingMatch[1].trim();
		}

		// Use filename without extension
		return file.basename;
	}

	private getAllFilesInFolder(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		
		for (const child of folder.children) {
			if (child instanceof TFile) {
				files.push(child);
			} else if (child instanceof TFolder) {
				files.push(...this.getAllFilesInFolder(child));
			}
		}

		return files;
	}

	/**
	 * Update selector options
	 */
	updateOptions(newOptions: Partial<NoteSelectorOptions>) {
		this.options = { ...this.options, ...newOptions };
	}

	/**
	 * Get current options
	 */
	getOptions(): NoteSelectorOptions {
		return { ...this.options };
	}
}