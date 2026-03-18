
import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { AppState, WorkflowStep, Topic } from './types';
import { INITIAL_STATE } from './constants';
import { geminiService } from './services/geminiService';
import { StepIndicator } from './components/StepIndicator';
import { CsvTable } from './components/CsvTable';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleError = (msg: string) => {
    setState(prev => ({ ...prev, error: msg, isLoading: false }));
    setIsGeneratingScript(false);
    setTimeout(() => setState(prev => ({ ...prev, error: null })), 5000);
  };

  const cancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(prev => ({ ...prev, isLoading: false, error: '生成已取消' }));
    setIsGeneratingScript(false);
    setTimeout(() => setState(prev => ({ ...prev, error: null })), 3000);
  };

  const startAnalysis = async () => {
    if (!state.referenceScript.trim()) {
      handleError('请输入参考剧本内容');
      return;
    }
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const { analysis, hookOptions } = await geminiService.analyzeScript(state.referenceScript);
      const csv = await geminiService.extractCSVTemplate(analysis);
      setState(prev => ({
        ...prev,
        step: WorkflowStep.TEMPLATE,
        analysis: analysis,
        hookOptions: hookOptions || [],
        selectedHookIndex: 0,
        csvTemplate: csv,
        isLoading: false
      }));
    } catch (err: any) {
      handleError(`分析失败: ${err.message}`);
    }
  };

  const generateAssetsOnly = async () => {
    if (!state.referenceScript.trim()) {
      handleError('请输入剧本内容以生成物料');
      return;
    }
    setState(prev => ({ ...prev, isLoading: true }));
    setIsGeneratingScript(true);
    abortControllerRef.current = new AbortController();

    try {
      const assets = await geminiService.generatePublicationAssets(state.referenceScript);
      
      setState(prev => ({
        ...prev,
        step: WorkflowStep.GENERATION,
        finalScript: state.referenceScript, 
        finalEditedScript: state.referenceScript,
        publicationAssets: assets,
        isLoading: false
      }));
      setIsGeneratingScript(false);
      abortControllerRef.current = null;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Generation aborted');
      } else {
        handleError(`物料生成失败: ${err.message}`);
      }
    }
  };

  const confirmTemplate = async () => {
    const csvToUse = state.confirmedCsv || state.csvTemplate;
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const topics = await geminiService.ideateTopics(csvToUse, state.topicDirection);
      setState(prev => ({
        ...prev,
        step: WorkflowStep.IDEATION,
        confirmedCsv: csvToUse,
        topics,
        isLoading: false
      }));
    } catch (err: any) {
      handleError(`获取选题失败: ${err.message}`);
    }
  };

  const refreshTopicsWithDirection = async () => {
    if (state.isLoading) return;
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const topics = await geminiService.ideateTopics(state.confirmedCsv || state.csvTemplate, state.topicDirection);
      setState(prev => ({
        ...prev,
        topics,
        isLoading: false
      }));
    } catch (err: any) {
      handleError(`刷新选题失败: ${err.message}`);
    }
  };

  const selectTopic = (topic: Topic | string) => {
    const title = typeof topic === 'string' ? topic : topic.title;
    if (!title.trim()) {
      handleError('选题内容不能为空');
      return;
    }

    setState(prev => ({ 
      ...prev, 
      selectedTopic: typeof topic === 'string' ? { title: topic, explanation: '用户自定义选题', citationLinks: [] } : topic, 
      step: WorkflowStep.HOOK_ASSEMBLY
    }));
  };

  const generateFinalScript = async () => {
    if (state.isLoading || isGeneratingScript) return;
    if (!state.selectedTopic) return;

    setState(prev => ({ ...prev, isLoading: true }));
    setIsGeneratingScript(true);
    
    abortControllerRef.current = new AbortController();

    try {
      let finalHook = '';
      if (state.hookOptions.length > 0) {
        const selected = state.hookOptions[state.selectedHookIndex];
        finalHook = selected.template;
        Object.keys(selected.slots).forEach(key => {
          finalHook = finalHook.replace(`{${key}}`, selected.slots[key].current);
        });
      }

      const script = await geminiService.generateFinalScript(
        state.confirmedCsv || state.csvTemplate, 
        state.selectedTopic.title,
        state.targetWordCount,
        finalHook
      );
      
      if (!abortControllerRef.current) return;

      const assets = await geminiService.generatePublicationAssets(script);

      setState(prev => ({
        ...prev,
        step: WorkflowStep.GENERATION,
        finalScript: script,
        finalEditedScript: script, 
        publicationAssets: assets,
        isLoading: false
      }));
      setIsGeneratingScript(false);
      abortControllerRef.current = null;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Generation aborted');
      } else {
        handleError(`剧本生成失败: ${err.message}`);
      }
    }
  };

  const reset = () => {
    setState(INITIAL_STATE);
    setIsEditMode(false);
    setIsGeneratingScript(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const copyToClipboard = (text: string, msg: string = '已复制到剪贴板') => {
    navigator.clipboard.writeText(text);
    alert(msg);
  };

  const getFormattedAssetsText = () => {
    if (!state.publicationAssets) return "";
    const { videoCaptions, coverTitles, pinnedComments, wechatSalesCopy } = state.publicationAssets;
    
    const formatList = (title: string, items: string[]) => {
      return `【${title} (3选1)】\n${items.map((item, i) => `  ${i + 1}. ${item}`).join('\n')}`;
    };

    return `${formatList('1. 发布文案', videoCaptions)}\n\n${formatList('2. 封面标题', coverTitles)}\n\n${formatList('3. 置顶评论', pinnedComments)}\n\n【4. 微信转发话术】\n${wechatSalesCopy}`;
  };

  const currentCsvData = state.confirmedCsv || state.csvTemplate;

  const navigateBack = () => {
    if (state.step > 1) {
      setState(prev => ({ ...prev, step: prev.step - 1 }));
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center pb-20">
      <header className="w-full bg-white border-b border-slate-200 py-6 mb-8 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-xl font-bold text-slate-800 leading-tight">视频剧本策略大师</h1>
                <p className="text-xs text-slate-500 font-medium">Video Script Reverse-Engineering Pro</p>
              </div>
              <a 
                href="https://ai.feishu.cn/wiki/VnbLwYOZyiH9LikEzwUcbgj7njc?from=from_copylink" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1 transition-all border border-blue-100"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span>使用文档</span>
              </a>
            </div>
          </div>
          <button onClick={reset} className="text-slate-400 hover:text-red-500 transition-colors flex items-center space-x-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-sm font-medium">重置流程</span>
          </button>
        </div>
      </header>

      <StepIndicator currentStep={state.step} />

      <main className="w-full max-w-5xl px-4 flex-1">
        {state.error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center space-x-3 animate-pulse">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            <p className="text-sm font-medium">{state.error}</p>
          </div>
        )}

        {state.step === WorkflowStep.ANALYSIS && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 animate-fadeIn">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">第一步：摄取与深度分析</h2>
            <p className="text-slate-600 mb-6">请粘贴成功视频的剧本。我将拆解其结构与套路，或直接为您生成传播物料。</p>
            <textarea
              className="w-full h-80 p-5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-700 leading-relaxed"
              placeholder="粘贴剧本..."
              value={state.referenceScript}
              onChange={(e) => setState(prev => ({ ...prev, referenceScript: e.target.value }))}
            />
            <div className="mt-8 flex justify-end space-x-4">
              <button 
                disabled={state.isLoading || !state.referenceScript.trim()} 
                onClick={generateAssetsOnly}
                className={`px-6 py-3 rounded-xl font-bold border-2 transition-all flex items-center space-x-2 ${
                  state.isLoading 
                  ? 'border-slate-200 text-slate-300' 
                  : 'border-orange-200 text-orange-600 hover:bg-orange-50 hover:border-orange-300'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>{state.isLoading ? '正在处理...' : '仅生成物料'}</span>
              </button>
              
              <button 
                disabled={state.isLoading || !state.referenceScript.trim()} 
                onClick={startAnalysis}
                className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all ${
                  state.isLoading ? 'bg-slate-300' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {state.isLoading ? '正在分析...' : '开始深度分析流程'}
              </button>
            </div>
          </div>
        )}

        {state.step === WorkflowStep.TEMPLATE && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 animate-fadeIn">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-bold text-slate-800">第二步：结构模版提取</h2>
              <button onClick={() => setIsEditMode(!isEditMode)} className="px-4 py-1.5 rounded-lg text-sm font-bold border bg-slate-50 text-slate-600">
                {isEditMode ? '切换表格视图' : '编辑原始 CSV'}
              </button>
            </div>
            
            <div className="space-y-4">
              {isEditMode ? (
                <textarea className="w-full h-80 p-5 font-mono text-sm border border-slate-200 rounded-xl bg-slate-900 text-blue-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={currentCsvData} onChange={(e) => setState(prev => ({ ...prev, confirmedCsv: e.target.value }))} />
              ) : (
                <CsvTable csvData={currentCsvData} />
              )}
            </div>
            <div className="mt-8 flex justify-between items-center">
              <button onClick={navigateBack} className="flex items-center space-x-1 text-slate-500 hover:text-slate-700 font-medium transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                <span>返回上一步</span>
              </button>
              <button 
                disabled={state.isLoading} 
                onClick={confirmTemplate} 
                className={`px-8 py-3 text-white rounded-xl font-bold shadow-lg transition-all flex items-center space-x-2 ${
                  state.isLoading ? 'bg-slate-400' : 'bg-green-600 hover:bg-green-700 active:scale-95'
                }`}
              >
                {state.isLoading && (
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                <span>{state.isLoading ? '正在分析模版并构思选题...' : '确认模版并进行选题'}</span>
              </button>
            </div>
          </div>
        )}

        {state.step === WorkflowStep.IDEATION && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 animate-fadeIn">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">第三步：选题构思</h2>
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl mb-4 flex items-center space-x-3">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-amber-800 font-medium">提示：AI 选题已通过搜索增强。请点击 Citation 链接自行确认事实真实性后再行使用。</p>
            </div>

            <div className="bg-slate-50/50 border border-slate-200 p-6 rounded-2xl mb-8">
              <div className="flex items-center space-x-3 mb-6 pb-6 border-b border-slate-200/60">
                <span className="text-sm font-bold text-slate-500 whitespace-nowrap">目标字数:</span>
                <input 
                  type="number" 
                  disabled={state.isLoading}
                  className="w-28 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all disabled:opacity-50"
                  value={state.targetWordCount} 
                  onChange={(e) => setState(prev => ({ ...prev, targetWordCount: parseInt(e.target.value) || 0 }))} 
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">AI 选题偏好</label>
                  <textarea 
                    disabled={state.isLoading}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 placeholder-slate-300 resize-none min-h-[120px] transition-all shadow-sm mb-4 flex-1 disabled:opacity-50" 
                    placeholder="输入方向，如：科技数码、育儿心经..."
                    value={state.topicDirection} 
                    onChange={(e) => setState(prev => ({ ...prev, topicDirection: e.target.value }))} 
                  />
                  <button 
                    disabled={state.isLoading} 
                    onClick={refreshTopicsWithDirection} 
                    className={`w-full py-3.5 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center space-x-2 active:scale-[0.98] ${
                      state.isLoading && !isGeneratingScript ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {state.isLoading && !isGeneratingScript && (
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    <span>{state.isLoading && !isGeneratingScript ? '正在联网联想中...' : '联网联想新选题'}</span>
                  </button>
                </div>

                <div className="bg-white border-2 border-dashed border-blue-100 p-6 rounded-2xl flex flex-col h-full shadow-sm">
                  <label className="block text-xs font-bold text-blue-500 uppercase tracking-widest mb-4">自定义精准选题</label>
                  <textarea 
                    disabled={state.isLoading}
                    className="w-full bg-slate-50/50 border border-slate-100 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-blue-400 outline-none transition-all resize-none mb-4 text-slate-900 flex-1 min-h-[120px] disabled:opacity-50" 
                    placeholder="在此输入您想要撰写的具体题目..."
                    value={state.customTopic}
                    onChange={(e) => setState(prev => ({ ...prev, customTopic: e.target.value }))}
                  />
                  <button 
                    disabled={state.isLoading || !state.customTopic.trim()} 
                    onClick={() => selectTopic(state.customTopic)}
                    className={`w-full py-3.5 text-white rounded-xl font-bold shadow-lg transition-all active:scale-[0.98] ${
                       isGeneratingScript ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-800 hover:bg-black'
                    }`}
                  >
                    下一步：拼装开场白
                  </button>
                </div>
              </div>
            </div>

            <div className={`grid grid-cols-1 gap-4 transition-all duration-300 ${isGeneratingScript || (state.isLoading && state.topics.length === 0) ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
              {state.topics.length > 0 && (
                <>
                  <div className="flex justify-between items-center px-2">
                    <p className="text-xs font-bold text-slate-400 uppercase">或选择 AI 构思的选题：</p>
                    {state.isLoading && !isGeneratingScript && (
                      <span className="text-[10px] text-blue-500 animate-pulse font-bold">正在更新选题列表...</span>
                    )}
                  </div>
                  {state.topics.map((topic, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => !state.isLoading && selectTopic(topic)} 
                      className={`p-6 rounded-2xl border-2 border-slate-100 bg-slate-50 hover:border-blue-200 hover:bg-white cursor-pointer transition-all group relative ${state.isLoading ? 'cursor-wait opacity-60' : ''}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-700">{topic.title}</h3>
                          <div className="text-sm text-slate-500 mt-1 prose prose-sm max-w-none">
                            <ReactMarkdown>{topic.explanation}</ReactMarkdown>
                          </div>
                          {topic.citationLinks && topic.citationLinks.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">参考来源:</span>
                              {topic.citationLinks.map((link, lIdx) => (
                                <a 
                                  key={lIdx} 
                                  href={link} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[10px] text-blue-500 hover:underline bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100"
                                >
                                  Citation [{lIdx + 1}]
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-xs font-bold bg-blue-600 text-white px-3 py-1 rounded-full shadow-sm">点击选择</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
            
            {!state.isLoading && (
              <div className="mt-8">
                <button onClick={navigateBack} className="flex items-center space-x-1 text-slate-500 hover:text-slate-700 font-medium transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  <span>返回上一步修改模版</span>
                </button>
              </div>
            )}
          </div>
        )}

        {state.step === WorkflowStep.HOOK_ASSEMBLY && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">第四步：开场白拼装</h2>
                <p className="text-slate-500 text-sm mt-1">针对选题《{state.selectedTopic?.title}》定制黄金开头</p>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">1. 选择开场策略</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {state.hookOptions.map((option, idx) => (
                  <div 
                    key={idx}
                    onClick={() => setState(prev => ({ ...prev, selectedHookIndex: idx }))}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      state.selectedHookIndex === idx
                      ? 'border-blue-500 bg-blue-50 shadow-md' 
                      : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
                        {idx === 0 ? '原剧本风格' : `AI 变体: ${option.style}`}
                      </span>
                      {state.selectedHookIndex === idx && (
                        <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed italic">"{option.content}"</p>
                  </div>
                ))}
              </div>
            </div>

            {state.hookOptions.length > 0 && (
              <div className="mb-8 bg-blue-50/50 border border-blue-100 p-6 rounded-2xl animate-fadeIn">
                <h3 className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-6 flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a2 2 0 01-2 2H3a2 2 0 01-2-2V4a2 2 0 114 0v10a2 2 0 002 2h10a2 2 0 012 2v1a2 2 0 11-4 0v-1a2 2 0 012-2h7a2 2 0 012 2v1a2 2 0 11-4 0" />
                  </svg>
                  2. 策略词汇拼装台
                </h3>
                
                <div className="space-y-6 text-slate-700 leading-loose">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-4">
                    {state.hookOptions[state.selectedHookIndex].template.split(/(\{.*?\})/).map((part, i) => {
                      const match = part.match(/\{(.*)\}/);
                      if (match) {
                        const key = match[1];
                        const slot = state.hookOptions[state.selectedHookIndex].slots[key];
                        return (
                          <div key={i} className="flex flex-col">
                            <span className="text-[10px] text-slate-400 font-bold mb-1 ml-1">{slot.label}</span>
                            <div className="flex items-center space-x-1">
                              <select 
                                className="bg-white border border-blue-200 rounded px-2 py-1.5 text-sm font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
                                value={slot.current}
                                onChange={(e) => {
                                  const newVal = e.target.value;
                                  setState(prev => {
                                    const newOptions = [...prev.hookOptions];
                                    newOptions[prev.selectedHookIndex].slots[key].current = newVal;
                                    return { ...prev, hookOptions: newOptions };
                                  });
                                }}
                              >
                                {slot.options.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                                <option value="CUSTOM">-- 手动输入 --</option>
                              </select>
                              {slot.current === "CUSTOM" && (
                                <input 
                                  className="bg-white border border-blue-200 rounded px-2 py-1.5 text-sm w-32 outline-none focus:ring-2 focus:ring-blue-400"
                                  placeholder="输入词汇..."
                                  onBlur={(e) => {
                                    const val = e.target.value;
                                    if (val) {
                                      setState(prev => {
                                        const newOptions = [...prev.hookOptions];
                                        newOptions[prev.selectedHookIndex].slots[key].current = val;
                                        return { ...prev, hookOptions: newOptions };
                                      });
                                    }
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      }
                      return <span key={i} className="text-slate-600 font-medium py-1.5 mt-5">{part}</span>;
                    })}
                  </div>
                </div>
                
                <div className="mt-8 p-5 bg-white border border-blue-100 rounded-2xl shadow-inner">
                  <p className="text-[10px] font-black text-slate-300 uppercase mb-3 tracking-tighter">实时拼装预览 (Real-time Preview)：</p>
                  <p className="text-lg text-slate-800 font-medium italic leading-relaxed">
                    "
                    {state.hookOptions[state.selectedHookIndex].template.split(/(\{.*?\})/).map((part, i) => {
                      const match = part.match(/\{(.*)\}/);
                      if (match) {
                        const key = match[1];
                        return <span key={i} className="text-blue-600 border-b-2 border-blue-200 px-1 mx-0.5">{state.hookOptions[state.selectedHookIndex].slots[key].current}</span>;
                      }
                      return part;
                    })}
                    "
                  </p>
                </div>
              </div>
            )}

            {isGeneratingScript && (
              <div className="flex flex-col items-center justify-center py-8 bg-blue-50/30 rounded-2xl border border-blue-100 animate-fadeIn mb-8">
                <div className="text-blue-600 font-bold text-sm mb-4 flex flex-col items-center">
                  <svg className="animate-spin h-8 w-8 text-blue-600 mb-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>正在为您撰写全篇剧本与物料...</span>
                </div>
                <button 
                  onClick={cancelGeneration}
                  className="px-6 py-2 bg-white border border-red-200 text-red-500 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors"
                >
                  取消生成
                </button>
              </div>
            )}

            <div className="mt-8 flex justify-between items-center">
              <button onClick={navigateBack} className="flex items-center space-x-1 text-slate-500 hover:text-slate-700 font-medium transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                <span>返回选题页面</span>
              </button>
              <button 
                disabled={state.isLoading || isGeneratingScript} 
                onClick={generateFinalScript} 
                className={`px-10 py-4 text-white rounded-xl font-bold shadow-xl transition-all flex items-center space-x-2 active:scale-95 ${
                  state.isLoading || isGeneratingScript ? 'bg-slate-400' : 'bg-slate-900 hover:bg-black'
                }`}
              >
                <span>开始生成全篇口播剧本</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </button>
            </div>
          </div>
        )}
        {state.step === WorkflowStep.GENERATION && (
          <div className="space-y-8 animate-fadeIn">
            <div className="flex justify-start">
              <button onClick={navigateBack} className="flex items-center space-x-1 text-slate-500 hover:text-slate-700 font-medium transition-colors bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                <span>返回开场拼装</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-100 p-2 rounded-lg"><svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></div>
                  <h2 className="text-xl font-bold text-slate-800">剧本文案</h2>
                </div>
                <button onClick={() => copyToClipboard(state.finalScript)} className="text-sm font-bold text-blue-600 hover:underline">复制全文</button>
              </div>
              <textarea
                className="w-full h-96 p-6 border border-slate-100 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-700 leading-relaxed font-sans text-lg shadow-inner"
                value={state.finalScript}
                readOnly
              />
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center space-x-3">
                  <div className="bg-orange-100 p-2 rounded-lg"><svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></div>
                  <h2 className="text-xl font-bold text-slate-800">全套发布物料 (多选一方案)</h2>
                </div>
                <button onClick={() => copyToClipboard(getFormattedAssetsText())} className="text-sm font-bold text-orange-600 hover:underline">复制物料</button>
              </div>
              <textarea
                className="w-full h-80 p-6 border border-slate-100 rounded-2xl bg-orange-50/30 focus:bg-white focus:ring-2 focus:ring-orange-500 outline-none transition-all text-slate-700 leading-relaxed font-mono text-sm shadow-inner"
                value={getFormattedAssetsText()}
                readOnly
              />
              <div className="mt-8 flex justify-center">
                 <button onClick={reset} className="px-12 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-black shadow-lg transition-transform hover:-translate-y-1">
                   完成，开启新任务
                 </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-20 w-full max-w-5xl px-4 flex justify-between items-center text-slate-400 text-xs py-8 border-t border-slate-200">
        <p>© 2024 Video Script Master • 剧本逆向工程专家</p>
        <span className="flex items-center space-x-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span className="font-medium">AI 引擎已就绪</span>
        </span>
      </footer>
    </div>
  );
};

export default App;
