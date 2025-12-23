
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
      contents: `基于之前的分析结果，将该剧本的结构提取为标准化的CSV格式。
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
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `基于以下确认的CSV剧本模版，构思3-4个不同且有潜力的全新选题。
${directionPrompt}
模版如下：\n${csvTemplate}\n\n
请以JSON数组格式输出，每个对象包含 title 和 explanation 两个字段。`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["title", "explanation"]
          }
        }
      }
    });
    return JSON.parse(response.text || '[]');
  },

  async generateFinalScript(csvTemplate: string, topic: string, wordCount: number) {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `请根据以下CSV模版和选定的主题，撰写一篇高质量的【纯口播】视频文案。

选题：${topic}
CSV模版：\n${csvTemplate}\n\n

🚨 极其重要要求：
1. **仅限纯口播内容**：严禁包含任何分镜说明、画面描述（如“画面转场”、“近景/特写”）、拍摄指令或后期建议。
2. **文本形式**：全文应呈现为一段流畅、连贯的朗读稿或演讲辞，适合出镜人直接对着提词器朗读。
3. **结构复刻**：必须精确遵循CSV定义的逻辑模块顺序，但不要在正文中打印CSV的表头，仅使用简洁的章节标题进行逻辑区分。
4. **语感还原**：完美复刻原剧本的语调（如犀利、幽默、沉稳）、节奏感（长短句交替）和情绪起伏。
5. **字数控制**：全文字数严格控制在 ${wordCount} 字左右。`,
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
1. **videoCaption**: 制造强烈好奇心。严禁总结，只给半颗糖。前15字必须极其抓人。
2. **coverTitles**: 提供3款封面标题（数字悬念型、冲突挑衅型、剧情留白型）。必须使用“具体数字”或“反常识”钩子。
3. **pinnedComment**: 严格执行[痛点共鸣]+[零成本指令]+[奖励]公式。字数≤20字，必加emoji，用“你”。
4. **wechatSalesCopy**: 以“肖东坡”人设撰写。包含问候、栏目介绍、基于剧本的悬念钩子、价值主张及CTA。话术要亲切自然，具有社交传染力。`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.85,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            videoCaption: { type: Type.STRING },
            coverTitles: { 
              type: Type.ARRAY,
              items: { type: Type.STRING },
              minItems: 3,
              maxItems: 3
            },
            pinnedComment: { type: Type.STRING },
            wechatSalesCopy: { type: Type.STRING }
          },
          required: ["videoCaption", "coverTitles", "pinnedComment", "wechatSalesCopy"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  }
};
