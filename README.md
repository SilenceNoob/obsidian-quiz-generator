# Obsidian Quest Generator Plugin

一个强大的 Obsidian 插件，可以从你的笔记库中随机选择笔记，并使用 DeepSeek API 生成测试题目。支持单选题、多选题和判断题，提供完整的答题界面和详细的结果分析。

## 功能特性

### 🎯 智能题目生成
- **多种题型支持**：单选题、多选题、判断题
- **AI 驱动**：使用 DeepSeek API 生成高质量题目
- **难度可调**：支持简单、中等、困难三个难度等级
- **内容丰富**：每道题目都包含详细解析

### 📚 灵活的笔记选择
- **随机选择**：从整个笔记库中随机选择笔记
- **当前笔记**：基于当前打开的笔记生成题目
- **智能过滤**：支持最小字数限制、文件夹排除等
- **多格式支持**：支持 .md、.txt 等多种文件格式

### 🎮 优秀的答题体验
- **直观界面**：清晰的题目展示和进度条
- **实时反馈**：答题过程中的视觉反馈
- **灵活导航**：支持题目间的前进后退
- **响应式设计**：适配不同屏幕尺寸

### 📊 详细的结果分析
- **综合评分**：百分比得分和等级评价
- **统计数据**：正确率、题型分布等详细统计
- **逐题解析**：每道题的详细解答和解释
- **错题回顾**：重点关注答错的题目

## 安装方法

### 开发版安装

1. **克隆仓库**
   ```bash
   git clone <repository-url>
   cd OBP_QuestGen
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **构建插件**
   ```bash
   npm run build
   ```

4. **复制到 Obsidian**
   将整个项目文件夹复制到你的 Obsidian vault 的 `.obsidian/plugins/` 目录下

5. **启用插件**
   在 Obsidian 设置中的「第三方插件」部分启用 "Quest Generator" 插件

## 配置设置

### DeepSeek API 配置

1. 访问 [DeepSeek 官网](https://www.deepseek.com/) 获取 API 密钥
2. 在插件设置中输入你的 API 密钥
3. 点击「测试连接」确保 API 配置正确

### 题目生成设置

- **题目数量**：设置每次生成的题目数量（1-20题）
- **难度等级**：选择题目难度（简单/中等/困难）
- **题目类型**：选择要生成的题型组合
  - ✅ 单选题：四选一的选择题
  - ✅ 多选题：多个正确答案的选择题
  - ✅ 判断题：对错判断题

### 笔记选择设置

- **最小字数**：设置笔记的最小字数要求
- **包含子文件夹**：是否搜索子文件夹中的笔记
- **排除文件夹**：设置要排除的文件夹（用逗号分隔）
- **文件扩展名**：设置要包含的文件类型

## 使用方法

### 快速开始

1. **配置 API**：在设置中输入 DeepSeek API 密钥
2. **生成测验**：
   - 点击左侧功能区的 🎯 图标，或
   - 使用命令面板搜索 "生成测验"
3. **开始答题**：在弹出的测验界面中逐题作答
4. **查看结果**：完成后查看详细的结果分析

### 命令列表

- **从随机笔记生成测验**：随机选择笔记生成题目
- **从当前笔记生成测验**：基于当前笔记生成题目
- **测试 DeepSeek API 连接**：验证 API 配置是否正确

### 答题技巧

- **仔细阅读**：认真阅读题目和所有选项
- **多选题注意**：多选题需要选择所有正确答案
- **利用解析**：答题后仔细阅读解析加深理解
- **错题回顾**：重点关注答错的题目

## 开发说明

### 项目结构

```
OBP_QuestGen/
├── main.ts              # 插件主文件
├── manifest.json        # 插件清单
├── package.json         # 项目配置
├── tsconfig.json        # TypeScript 配置
├── esbuild.config.mjs   # 构建配置
├── styles.css           # 样式文件
├── src/
│   ├── DeepSeekAPI.ts      # DeepSeek API 接口
│   ├── QuestionGenerator.ts # 题目生成器
│   ├── NoteSelector.ts     # 笔记选择器
│   ├── QuizModal.ts        # 答题界面
│   └── ResultModal.ts      # 结果展示界面
└── README.md            # 说明文档
```

### 开发命令

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建生产版本
npm run build

# 版本更新
npm run version
```

### 技术栈

- **TypeScript**：主要开发语言
- **Obsidian API**：插件开发框架
- **DeepSeek API**：AI 题目生成
- **esbuild**：快速构建工具
- **CSS3**：现代样式设计

## API 说明

### DeepSeek API

本插件使用 DeepSeek API 进行题目生成。API 调用包括：

- **模型**：deepseek-chat
- **温度**：0.7（平衡创造性和准确性）
- **最大令牌**：2000
- **流式输出**：否

### 题目格式

生成的题目遵循以下 JSON 格式：

```json
{
  "questions": [
    {
      "type": "multiple_choice",
      "question": "题目内容",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correct_answer": [0],
      "explanation": "详细解析"
    }
  ]
}
```

## 故障排除

### 常见问题

**Q: API 连接失败**
A: 检查网络连接和 API 密钥是否正确

**Q: 没有找到合适的笔记**
A: 降低最小字数要求或检查排除文件夹设置

**Q: 题目生成失败**
A: 确保笔记内容足够丰富，尝试选择其他笔记

**Q: 界面显示异常**
A: 尝试重启 Obsidian 或重新安装插件

### 调试模式

开启 Obsidian 的开发者工具（Ctrl+Shift+I）查看控制台日志获取详细错误信息。

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 更新日志

### v1.0.0
- 🎉 初始版本发布
- ✨ 支持单选题、多选题、判断题生成
- ✨ 完整的答题和结果展示界面
- ✨ DeepSeek API 集成
- ✨ 灵活的笔记选择和过滤
- ✨ 响应式设计和暗色主题支持

## 致谢

- [Obsidian](https://obsidian.md/) - 优秀的笔记软件
- [DeepSeek](https://www.deepseek.com/) - 强大的 AI 模型
- Obsidian 社区的开发者们

---

如果这个插件对你有帮助，请考虑给个 ⭐ Star！