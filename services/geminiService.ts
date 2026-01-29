
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const geminiService = {
  async analyzeScript(script: string) {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `请深度分析以下视频参考剧本：\n\n${script}\n\n请从结构、钩子机制、节奏感、语调（如宏大叙事、情感叙事、数据驱动）以及独特的风格元素进行多维度拆解。`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.7,
      }
    });
    return response.text || '';
  },

  async extractCSVTemplate(analysisResult: string) {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `基于之前的分析结果，仅将该剧本的结构提取为标准化的CSV代码。不要包含任何额外的解释或文字。
分析结果：\n${analysisResult}\n\n
CSV必须包含以下表头：
模块 (Module), 功能与目标 (Function & Goal), 写作套路/标准化手法 (Standardized Writing Technique), 关键元素/关键词示例 (Key Elements/Keywords Examples).

请直接输出CSV代码块。`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.2,
      }
    });
    return response.text || '';
  },

  async ideateTopics(csvTemplate: string, direction?: string) {
    const ai = getAI();
    const directionPrompt = direction ? `请特别聚焦于以下选题方向: "${direction}"。` : '请基于模版自由构思具有潜力的选题。';
    
    // Using gemini-3-pro-preview as it's better for complex reasoning/ideation
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", 
      contents: `基于以下确认的CSV剧本模版，构思3-4个真实、有深度且有潜力的全新选题。
      
🚨 核心要求：
1. **真实性保证**：你必须利用 Google Search 实时搜索功能，确保选题内容基于真实的社会热点、行业趋势、科学事实 or 历史背景。
2. **格式要求**：你必须以严格的 JSON 数组格式返回，不要包含任何 Markdown 代码块包裹。
3. **内容结构**：每个对象包含 title (选题标题), explanation (深度解析) 两个字段。

${directionPrompt}

模版如下：\n${csvTemplate}\n\n
请直接输出 JSON 数组。`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ googleSearch: {} }], 
        temperature: 0.7,
      }
    });

    const rawText = response.text || '[]';
    // Extracting URLs from grounding metadata as per core requirement
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const searchLinks = groundingChunks
      .filter((chunk: any) => chunk.web && chunk.web.uri)
      .map((chunk: any) => chunk.web.uri);

    try {
      // Basic cleanup in case model returns markdown code block
      const jsonStr = rawText.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      
      return parsed.map((item: any) => ({
        ...item,
        citationLinks: searchLinks.slice(0, 3) // Distribute first few links across topics or keep them general
      }));
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", rawText);
      // Fallback: If JSON parsing fails, return a simulated list based on the text to avoid empty UI
      return [{ title: "生成失败，请重试", explanation: "AI 返回格式不符合预期，请尝试再次点击联网联想。", citationLinks: [] }];
    }
  },

  async generateFinalScript(csvTemplate: string, topic: string, wordCount: number) {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `请根据以下CSV模版和选定的主题，撰写一篇高质量的【纯口播】视频文案。

选题：${topic}
CSV模版：\n${csvTemplate}\n\n

🚨 极其重要要求：
1. **仅限纯口播内容**：严禁包含任何分镜说明、画面描述、拍摄指令或后期建议。
2. **文本形式**：全文应呈现为一段流畅、连贯的朗读稿，适合出镜人直接对着提词器朗读。
3. **结构复刻**：必须精确遵循CSV定义的逻辑模块顺序，但不要在正文中打印CSV的表头，仅使用简洁的章节标题进行逻辑区分。
4. **语感还原**：完美复刻原剧本的语调和节奏感。
5. **结尾钩子 (Closing Hook)**：视频末尾必须包含利他主义视角的互动钩子。
6. **字数控制**：全文字数严格控制在 ${wordCount} 字左右。`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });
    return response.text || '';
  },

  async generatePublicationAssets(finalScript: string) {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `你现在的身份是顶尖短视频运营专家。请基于以下最终剧本，通过“好奇心缺口”逻辑生成全套物料。
剧本全文：\n${finalScript}\n\n
要求：
1. **videoCaptions**: 提供3款不同风格的发布文案。要求制造强烈好奇心，严禁总结，前15字必须极其抓人。
   🚨 重要：每条文案末尾必须严格执行系统指令中的【话题标签要求】，追加 4-5 个话题标签（格式如 #话题）。
2. **coverTitles**: 提供3款封面标题（数字悬念型、冲突挑衅型、剧情留白型）。
3. **pinnedComments**: 提供3款不同策略的置顶评论（社交话术型、存档工具型、情绪认同型）。
   写作规则：1) 强关联内容；2) 字数≤20字；3) 包含且仅包含1个emoji；4) 使用“你”；5) 零成本包装。
4. **wechatSalesCopy**: 以“肖东坡”人设撰写一条亲切自然的微信转发话术。`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.85,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            videoCaptions: { 
              type: Type.ARRAY,
              items: { type: Type.STRING },
              minItems: 3,
              maxItems: 3
            },
            coverTitles: { 
              type: Type.ARRAY,
              items: { type: Type.STRING },
              minItems: 3,
              maxItems: 3
            },
            pinnedComments: { 
              type: Type.ARRAY,
              items: { type: Type.STRING },
              minItems: 3,
              maxItems: 3
            },
            wechatSalesCopy: { type: Type.STRING }
          },
          required: ["videoCaptions", "coverTitles", "pinnedComments", "wechatSalesCopy"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  }
};
