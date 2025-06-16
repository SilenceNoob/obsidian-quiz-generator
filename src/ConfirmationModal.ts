import { App, Modal } from 'obsidian';

export class ConfirmationModal extends Modal {
	private onConfirm: () => void;
	private title: string;
	private message: string;
	private confirmText: string;
	private cancelText: string;

	constructor(
		app: App,
		title: string,
		message: string,
		onConfirm: () => void,
		confirmText: string = '确认',
		cancelText: string = '取消'
	) {
		super(app);
		this.title = title;
		this.message = message;
		this.onConfirm = onConfirm;
		this.confirmText = confirmText;
		this.cancelText = cancelText;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// 设置模态框样式
		contentEl.addClass('quest-generator-confirmation-modal');

		// 标题
		const titleEl = contentEl.createEl('h2', {
			text: this.title,
			cls: 'confirmation-modal-title'
		});

		// 消息内容
		const messageEl = contentEl.createEl('p', {
			text: this.message,
			cls: 'confirmation-modal-message'
		});

		// 按钮容器
		const buttonContainer = contentEl.createEl('div', {
			cls: 'confirmation-modal-buttons'
		});

		// 取消按钮
		const cancelButton = buttonContainer.createEl('button', {
			text: this.cancelText,
			cls: 'mod-cta confirmation-modal-cancel'
		});
		cancelButton.addEventListener('click', () => {
			this.close();
		});

		// 确认按钮
		const confirmButton = buttonContainer.createEl('button', {
			text: this.confirmText,
			cls: 'mod-warning confirmation-modal-confirm'
		});
		confirmButton.addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});

		// 默认聚焦到取消按钮
		cancelButton.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}