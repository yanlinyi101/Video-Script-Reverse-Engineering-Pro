
import React, { useState, useRef } from 'react';
import { AppState, WorkflowStep, Topic } from './types';
import { INITIAL_STATE } from './constants';
import { geminiService } from './services/geminiService';
import { StepIndicator } from './components/StepIndicator';
import { CsvTable } from './components/CsvTable';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Ref to hold AbortController for cancelling AI requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleError = (msg: string) => {
    setState(prev => ({ ...prev, error: msg, isLoading: false }));
    setTimeout(() => setState(prev => ({ ...prev, error: null })), 5000);
  };

  const cancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(prev => ({ ...prev, isLoading: false, error: '生成已取消' }));
    setTimeout(() => setState(prev => ({ ...prev, error: null })), 3000);
  };

  const startAnalysis = async () => {
    if (!state.referenceScript.trim()) {
      handleError('请输入参考剧本内容');
      return;
    }
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const analysisText = await geminiService.analyzeScript(state.referenceScript);
      const csv = await geminiService.extractCSVTemplate(analysisText);
      setState(prev => ({
        ...prev,
        step: WorkflowStep.TEMPLATE,
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
    abortControllerRef.current = new AbortController();

    try {
      const assets = await geminiService.generatePublicationAssets(state.referenceScript);
      
      setState(prev => ({
        ...prev,
        step: WorkflowStep.GENERATION,
        finalScript: state.referenceScript, // 使用输入的剧本作为最终剧本显示
        finalEditedScript: state.referenceScript,
        publicationAssets: assets,
        isLoading: false
      }));
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

  const selectTopicAndGenerate = async (topic: Topic | string) => {
    const title = typeof topic === 'string' ? topic : topic.title;
    if (!title.trim()) {
      handleError('选题内容不能为空');
      return;
    }

    setState(prev => ({ 
      ...prev, 
      selectedTopic: typeof topic === 'string' ? { title: topic, explanation: '用户自定义选题' } : topic, 
      isLoading: true 
    }));
    
    // Create new controller for this generation
    abortControllerRef.current = new AbortController();

    try {
      // 1. 生成口播文案
      const script = await geminiService.generateFinalScript(
        state.confirmedCsv || state.csvTemplate, 
        title,
        state.targetWordCount
      );
      
      // Check if cancelled
      if (!abortControllerRef.current) return;

      // 2. 紧接着生成物料
      const assets = await geminiService.generatePublicationAssets(script);

      setState(prev => ({
        ...prev,
        step: WorkflowStep.GENERATION,
        finalScript: script,
        finalEditedScript: script, 
        publicationAssets: assets,
        isLoading: false
      }));
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
    const { videoCaption, coverTitles, pinnedComment, wechatSalesCopy } = state.publicationAssets;
    return `【1. 发布文案】\n${videoCaption}\n\n【2. 封面标题】\n${coverTitles.join('\n')}\n\n【3. 置顶评论】\n${pinnedComment}\n\n【4. 微信转发话术】\n${wechatSalesCopy}`;
  };

  const currentCsvData = state.confirmedCsv || state.csvTemplate;

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
            <div>
              <h1 className="text-xl font-bold text-slate-800">视频剧本策略大师</h1>
              <p className="text-xs text-slate-500 font-medium">Video Script Reverse-Engineering Pro</p>
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

        {/* Step 1: Analysis */}
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

        {/* Step 2: CSV Template */}
        {state.step === WorkflowStep.TEMPLATE && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 animate-fadeIn">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-bold text-slate-800">第二步：模版提取与确认</h2>
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
              <button onClick={() => setState(prev => ({ ...prev, step: WorkflowStep.ANALYSIS }))} className="text-slate-500 font-medium">返回上一步</button>
              <button disabled={state.isLoading} onClick={confirmTemplate} className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg">
                确认模版并进行选题
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Ideation */}
        {state.step === WorkflowStep.IDEATION && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 animate-fadeIn">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">第三步：选题构思</h2>
            <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">AI 选题偏好</label>
                  <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="输入方向，如：科技数码、育儿心经..."
                    value={state.topicDirection} onChange={(e) => setState(prev => ({ ...prev, topicDirection: e.target.value }))} />
                  <div className="flex items-center space-x-3">
                    <span className="text-xs font-bold text-slate-400 whitespace-nowrap">目标字数:</span>
                    <input type="number" className="w-24 bg-white border border-slate-200 rounded-lg px-3 py-1 text-sm"
                      value={state.targetWordCount} onChange={(e) => setState(prev => ({ ...prev, targetWordCount: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <button disabled={state.isLoading} onClick={refreshTopicsWithDirection} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all">
                    {state.isLoading ? '联想中...' : '由 AI 构思选题'}
                  </button>
                </div>

                <div className="bg-white border-2 border-dashed border-blue-100 p-6 rounded-2xl flex flex-col">
                  <label className="block text-xs font-bold text-blue-500 uppercase tracking-widest mb-4">自定义精准选题</label>
                  <textarea 
                    className="flex-1 w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-blue-400 outline-none transition-all resize-none mb-4" 
                    placeholder="在此输入您想要撰写的具体题目..."
                    value={state.customTopic}
                    onChange={(e) => setState(prev => ({ ...prev, customTopic: e.target.value }))}
                  />
                  <button 
                    disabled={state.isLoading || !state.customTopic.trim()} 
                    onClick={() => selectTopicAndGenerate(state.customTopic)}
                    className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-black shadow-lg"
                  >
                    生成全篇口播+物料 →
                  </button>
                </div>
              </div>
            </div>

            {state.isLoading && (
              <div className="flex flex-col items-center justify-center py-8 bg-blue-50 rounded-2xl border border-blue-100 animate-fadeIn mb-8">
                <div className="text-blue-600 font-bold text-lg mb-4 flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  专家正在撰写，预计需要 30-60 秒...
                </div>
                <button 
                  onClick={cancelGeneration}
                  className="px-6 py-2 bg-white border border-red-200 text-red-500 rounded-lg text-sm font-bold hover:bg-red-50 transition-colors shadow-sm"
                >
                  取消生成
                </button>
              </div>
            )}

            {!state.isLoading && state.topics.length > 0 && (
              <div className="grid grid-cols-1 gap-4">
                <p className="text-xs font-bold text-slate-400 uppercase px-2">或选择 AI 构思的选题：</p>
                {state.topics.map((topic, idx) => (
                  <div key={idx} onClick={() => selectTopicAndGenerate(topic)} className="p-6 rounded-2xl border-2 border-slate-100 bg-slate-50 hover:border-blue-200 hover:bg-white cursor-pointer transition-all group">
                    <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-700">{topic.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">{topic.explanation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Final Generation Results */}
        {state.step === WorkflowStep.GENERATION && (
          <div className="space-y-8 animate-fadeIn">
            {/* Box 1: Oral Script */}
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

            {/* Box 2: Publication Assets */}
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center space-x-3">
                  <div className="bg-orange-100 p-2 rounded-lg"><svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></div>
                  <h2 className="text-xl font-bold text-slate-800">全套发布物料 (点击转化增强)</h2>
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
