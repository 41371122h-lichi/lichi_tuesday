import { Content, FunctionDeclaration, GoogleGenAI, Part as SDKPart, Type } from '@google/genai';
import React, { useEffect, useMemo, useRef, useState } from 'react';
// === [1. 新增 Recharts 導入] ===
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// ----------------------------- Types ----------------------------------------
export type Part = { text: string }; 
export type ChatMsg = { role: 'user' | 'model' | 'function'; parts: Part[]; name?: string };
type Props = { starter?: string };

// 用於 GraphDisplay 的數據類型
type ChartData = {
  data: Array<{
    [key: string]: any;
    name?: string;
    y?: number;
    value?: number;
    count?: number;
    key?: string;
  }>;
  component_id: string;
};

// ----------------------------- Config --------------------------------------
const FIXED_API_KEY = 'AIzaSyBufFzIl5hJR-mPetOWfBxR7NnN8lPZHLM';
const FIXED_MODEL_ID = 'gemini-2.5-flash';
const CITY = 'taipei'; // 預設城市
const PROXY_BASE_URL = 'http://localhost:4000'; // 您的代理伺服器基礎 URL
const SYSTEM_INSTRUCTION = `
你是一位精通「台北都市建設」的領域專家小幫手。

**【核心職責與原則】**
1.  **知識優先：** 對於一般性的知識問題（例如：流程說明、政策定義、背景資訊），請**直接利用你的廣泛知識庫**以專業、精簡的**繁體中文**回答。
2.  **數據輔助：** 只有當使用者需要**最新的、具體的統計數據、數量或圖表**時，你才需要依賴台北城市儀表板「都市建設」分頁的資料。
3.  **工具使用：** 若請求需要數據視覺化，你必須使用 \`get_chart_data\` 工具來獲取數據。
4.  **回答格式：** 保持簡潔、專業。絕對不要在最終回答中包含你的思維過程、推論步驟或工具呼叫的代碼區塊。
5.  **數據解釋：** 成功呼叫工具後，請精簡地解釋數據內容，**不要直接回傳原始 JSON**。
`;
// ----------------------------- Tool Definition -----------------------------
const CHART_TOOL_SCHEMA: FunctionDeclaration = {
  name: 'get_chart_data',
  description: '根據 component ID 獲取台北城市儀表板中特定圖表組件的原始 JSON 資料。component ID 必須從已載入的都市建設資料中找到。',
  parameters: {
    type: Type.OBJECT,
    properties: {
      component_id: {
        type: Type.STRING,
        description: '欲獲取圖表資料的組件 ID (component ID)，例如 "57" 或 "102"。',
      },
    },
    required: ['component_id'],
  },
};

// ----------------------------- Graph Display Component (使用 Recharts) -----------------------------
/**
 * 圖表顯示組件：接收解析後的圖表數據並展示
 */
const GraphDisplay: React.FC<{ chartData: ChartData | null }> = ({ chartData }) => {
  if (!chartData || !chartData.data || chartData.data.length === 0) {
    return (
      <div style={graphStyles.box}>
        <div style={graphStyles.placeholder}>
          等待 AI 呼叫工具以獲取圖表數據...
        </div>
      </div>
    );
  }
  
  const componentId = chartData.component_id;
  
  // === [2. 數據轉換邏輯 - 重點修正] ===
  // 1. 先將所有嵌套的 data 陣列扁平化 (flatten)
  const flattenedData = chartData.data.flatMap(item => {
    // 如果 item 裡面還有一個 data 陣列，我們就用裡面的陣列
    if (Array.isArray(item.data)) {
        return item.data;
    }
    // 否則，直接使用 item
    return item;
  });

  // 2. 將扁平化後的數據格式統一為 Recharts 可用的 { name: string, value: number } 格式
  const chartDataForRecharts = flattenedData
    .map(item => {
      // 優先使用 'x' 和 'y' 欄位，這和 API 回傳的結構一致
      const name = item.x || item.name || item.key || String(item.id) || '項目';
      const value = Number(item.y || item.value || item.count || 0); // y, value, count 都是可能的數值欄位
      
      return {
        name: name,
        value: value,
      };
    })
    .filter(d => d.value > 0) // 只保留數值大於 0 的項目
    .slice(0, 10); // 只取前 10 筆資料繪製，避免過度擁擠

  if (chartDataForRecharts.length === 0) {
     return (
        <div style={graphStyles.box}>
            <div style={graphStyles.placeholder}>
                Component ID: {componentId} <br/> 數據已載入，但無有效可繪製的數值（數值皆為零或轉換失敗）。
            </div>
        </div>
    );
  }

  // === [3. 渲染 Recharts 條形圖] ===
  return (
    <div style={{...graphStyles.box, padding: '16px 8px 16px 16px'}}>
      <h3 style={graphStyles.title}>數據視覺化 (ID: {componentId})</h3>
      <p style={{...graphStyles.summary, marginBottom: 16}}>圖表類型: 條形圖 (顯示 {chartDataForRecharts.length} 筆資料)</p>
      
      <ResponsiveContainer width="100%" height={300}>
        <BarChart 
            data={chartDataForRecharts} 
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
          <XAxis 
            dataKey="name" 
            angle={-30} 
            textAnchor="end" 
            height={50} 
            interval={0} 
            tick={{fontSize: 10}}
          />
          <YAxis />
          <Tooltip 
             contentStyle={{ 
                borderRadius: 8, 
                backgroundColor: 'rgba(255, 255, 255, 0.9)', 
                fontSize: 12 
            }} 
          />
          <Bar dataKey="value" fill="#a78bfa" />
        </BarChart>
      </ResponsiveContainer>

    </div>
  );
};

// ----------------------------- Main Component ------------------------------------
export default function AItest({
  starter = '請問最近台北市有哪些重要的都市更新案正在進行？',
}: Props) {
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [latestChartData, setLatestChartData] = useState<ChartData | null>(null); // 新增 State 儲存圖表數據
  const [aiSetupError, setAiSetupError] = useState('');
  const [constructionData, setConstructionData] = useState<any>(null);
  const [fetchingData, setFetchingData] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 建立 AI 實例
  const ai = useMemo(() => {
    try {
      if (!FIXED_API_KEY) {
        setAiSetupError('請設定有效的 API Key。');
        return null;
      }
      setAiSetupError('');
      return new GoogleGenAI({ apiKey: FIXED_API_KEY });
    } catch (e: any) {
      setAiSetupError(`AI 實例建立失敗: ${e.message}`);
      return null;
    }
  }, []);
  

  // ----------------------------- Tool Implementation -----------------------------
  /** 實作工具: 抓取特定 component ID 的圖表資料 */
  async function get_chart_data(component_id: string): Promise<string> {
    console.log(`[Tool Call] Fetching chart data for component ID: ${component_id}`);
    
    // 使用萬用轉發代理路徑：/api/v1/component/:id/chart?city=taipei
    const targetUrl = `${PROXY_BASE_URL}/api/v1/component/${component_id}/chart?city=${CITY}`;

    try {
      const res = await fetch(targetUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} from proxy for component ${component_id}`);
      }
      
      const data = await res.json();
      
      // 將原始 JSON 轉成字串回傳給 AI
      return JSON.stringify(data);
      
    } catch (err: any) {
      console.error('[Tool Error]', err);
      return `ERROR: 抓取圖表資料失敗。訊息：${err.message || String(err)}`;
    }
  }
  
  // 映射工具名稱到實際函數
  const availableTools: Record<string, Function> = {
    get_chart_data,
  };
  
  // ----------------------------- API: 抓取城市儀表板資料 -----------------------------
  async function fetchTaipeiConstructionData() {
    setFetchingData(true);
    setError(''); 

    try {
      const PROXY_URL = `${PROXY_BASE_URL}/api/v1/dashboard/construction`; 
      const res = await fetch(PROXY_URL);  
      
      if (!res.ok) {
        throw new Error(`HTTP 錯誤: ${res.status} ${res.statusText}。請確認 Node.js 代理伺服器是否已啟動。`);
      }
      
      const data = await res.json();
      
      if (!data || typeof data !== 'object') {
          throw new Error('API 返回的資料格式無效。');
      }

      setConstructionData(data);
      
      setHistory(h => [...h, { role: 'model', parts: [{ text: '✅ **都市建設資料已成功更新**！您現在可以開始提問，若需特定圖表，請直接詢問，我會自動幫您抓取。' }] }]);

      return data;
    } catch (err: any) {
      const message = err.message.includes('HTTP') 
          ? err.message 
          : `抓取都市建設資料時發生網路或CORS錯誤。訊息：${err.message}`;
      
      setError(message);
      setConstructionData(null); 
      return null;
    } finally {
      setFetchingData(false);
    }
  }


  // ----------------------------- AI 對話 (已修正 generateContent Tool Call Loop) -----------------------------
  async function sendMessage(message?: string) {
    const content = (message ?? input).trim();
    if (!content || loading) return;
    if (aiSetupError || !ai) { setError(aiSetupError || 'AI 實例未準備好'); return; } 

    setError('');
    setLoading(true);

    const newUserMsg: ChatMsg = { role: 'user', parts: [{ text: content }] };
    setHistory((h) => [...h, newUserMsg]);
    setInput('');

    try {
      // 1. 準備歷史訊息
      const historyContents: Content[] = history.flatMap(msg => {
          if (msg.role !== 'user' && msg.role !== 'model') {
              return [];
          }
          
          const role: 'user' | 'model' = msg.role; 
          const parts: SDKPart[] = msg.parts.map(p => ({ text: p.text }));
          
          return [{ role, parts }];
      });
      
      // *** [修正重點]：判斷是否為數據相關問題 ***
      const dataKeywords = ['圖表', '數據', '統計', '數量', '哪個', '多少', '清單', '列表', '排行', '案'];
      const isDataQuery = dataKeywords.some(kw => content.includes(kw));
      
      let dataRef = '';

      if (isDataQuery && constructionData) {
          // 只有在偵測到數據關鍵字且資料已載入時，才附加數據
          dataRef = `\n\n[已載入數據]：\n${JSON.stringify(constructionData)}`;
      } else if (!constructionData) {
          // 如果資料尚未載入，則提醒 AI 數據狀態
          dataRef = '\n\n[數據狀態]：尚未載入都市建設數據，請提醒使用者載入資料後再詢問詳細數據。';
      }
      
      const initialMessage: Content = {
        role: 'user',
        parts: [{ text: content + dataRef }], 
      };
      
      let currentHistory: Content[] = [...historyContents, initialMessage];
      // *** [修正重點] 結束 ***
      
      let toolCallCount = 0; 
      let finalReplyGenerated = false;

      // 2. 進入 Tool Call Loop
      while (toolCallCount < 5 && !finalReplyGenerated) { 
          // 呼叫 ai.models.generateContent
          const resp = await ai.models.generateContent({
              model: FIXED_MODEL_ID,
              contents: currentHistory, // 傳遞完整的歷史記錄和當前訊息
              config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: [{ functionDeclarations: [CHART_TOOL_SCHEMA] }] // 傳遞工具定義
              }
          });
          
          // 檢查是否有工具呼叫請求 (從 parts 中篩選 functionCall)
          const rawFunctionCalls = resp.candidates?.[0]?.content?.parts?.filter(
            (part) => part.functionCall
          ).map(part => part.functionCall);
          
          // *** 修正: 對 FunctionCall 陣列進行明確型別斷言 (消除紅底線) ***
          const functionCalls = (rawFunctionCalls || []) as Array<{ name: string, args: Record<string, any> }>;


          if (functionCalls.length > 0) { 
              // 3. AI 請求呼叫工具
              const toolCall = functionCalls[0]; 
              const functionName = toolCall.name; 
              // 確保 args 類型正確
              const functionArgs = toolCall.args as Record<string, string>; 
              
              if (!availableTools[functionName]) {
                  throw new Error(`AI 請求了不存在的工具: ${functionName}`);
              }
              
              // 呼叫實際工具函數
              const toolFunction = availableTools[functionName];
              const result = await toolFunction.apply(null, Object.values(functionArgs));
              
              // *** 新增: 嘗試解析圖表 JSON 數據並儲存至 State ***
              try {
                  const parsedResult = JSON.parse(result);
                  // 將 component_id 也儲存進去，供右側組件顯示
                  const dataToStore: ChartData = {
                    ...parsedResult,
                    component_id: functionArgs.component_id 
                  };
                  setLatestChartData(dataToStore);
              } catch(e) {
                  console.error('無法解析圖表數據 JSON', e);
                  setLatestChartData(null); 
              }
              // *************************************************

              // 4. 準備下一輪傳送給 AI 的訊息 (Function Response)
              const functionResponseContent: Content = {
                  role: 'tool', 
                  parts: [{
                      functionResponse: {
                          name: functionName,
                          response: { data: result }, 
                      }
                  }],
              };

              // 將 Tool Response 加入歷史記錄
              currentHistory = [...currentHistory, functionResponseContent];
              
              // 將 Function Response 顯示在前端
              const displayMsg: ChatMsg = {
                  role: 'function',
                  name: functionName,
                  parts: [{ text: `🛠️ 呼叫工具: ${functionName}(${JSON.stringify(functionArgs)}) \n\n結果摘要：${result.slice(0, 300)}...` }],
              };
              setHistory(h => [...h, displayMsg]);
              
              toolCallCount++;

          } else {
              // 5. AI 回傳最終回覆
              const reply = resp.text || '[沒有內容]';
              setHistory((h) => [...h, { role: 'model', parts: [{ text: reply }] }]);
              finalReplyGenerated = true;
          }
      }

      if (toolCallCount >= 5) {
          setError('AI 執行工具呼叫次數過多，停止對話以避免無限迴圈。');
      }
      
    } catch (err: any) {
      setError(err?.message || String(err));
      // 如果出錯，移除最後一條使用者訊息
      setHistory((h) => h.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------- Render -----------------------------

  useEffect(() => {
    // 初始歡迎訊息
    setHistory([
      {
        role: 'model',
        parts: [{ text: '👋 這裡是 **台北都市建設小幫手**，我可以幫你查詢最新的都市建設進度喔！請先點擊「🔄 點擊獲取最新建設資料」以獲取最新資訊。' }],
      },
    ]);
    if (starter) setInput(starter);
  }, [starter]);

  useEffect(() => {
    // 自動捲到底
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history, loading]);


  function renderMarkdownLike(text: string) {
    const lines = text.split(/\n/);
    return (
      <>
        {lines.map((ln, i) => {
          const parts = ln.split('**').map((p, j) =>
            j % 2 === 1 ? <b key={j}>{p}</b> : <React.Fragment key={j}>{p}</React.Fragment>
          );
          return (
            <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {parts}
            </div>
          );
        })}
      </>
    );
  }

  // 互動樣式 (使用 style 標籤)
  const GlobalStyles = () => (
    <style dangerouslySetInnerHTML={{__html: `
        .AItest_card button:not(:disabled):hover {
            transform: scale(1.03);
            opacity: 0.9;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .AItest_card button.suggestion:not(:disabled):hover {
             background: #fdf2f8 !important; /* 淺粉色/紫色 */
        }
        .AItest_card button.sendBtn:not(:disabled):hover {
            background: #8b5cf6 !important; /* 更深的紫色 */
        }
        .AItest_card input:focus {
            border-color: #8b5cf6 !important; /* 深紫色高亮 */
            box-shadow: 0 0 4px #c4b5fd;
        }
    `}} />
  );


  return (
    <div style={styles.wrap}>
      {GlobalStyles()}
      
      {/* 左右分欄容器 */}
      <div style={mainContainerStyles.container}>
          {/* 左欄：聊天介面 (原 styles.card) */}
          <div style={mainContainerStyles.chatCard} className="AItest_card">
              <div style={styles.header}>🏗️ 台北都市建設 Gemini 小幫手</div>

              {/* 抓取資料按鈕 */}
              <div style={{ padding: '8px 12px', textAlign: 'right' }}>
                <button
                  onClick={fetchTaipeiConstructionData}
                  disabled={fetchingData}
                  style={{ ...styles.suggestion, background: constructionData ? '#d8b4fe' : '#ede9fe', fontWeight: 600, color: constructionData ? '#fff' : '#1f1f1f', border: 'none' }}
                >
                  {fetchingData ? '更新中...' : constructionData ? '✅ 資料已載入' : '🔄 點擊獲取最新建設資料'}
                </button>
              </div>

              {/* 訊息列表 */}
              <div ref={listRef} style={styles.messages}>
                {history.map((m, i) => (
                  <div
                    key={i}
                    style={{ ...styles.msg, ...(m.role === 'user' ? styles.user : m.role === 'function' ? styles.toolCall : styles.assistant) }}
                  >
                    <div style={styles.msgRole}>{m.role === 'user' ? '你' : m.role === 'model' ? 'Gemini' : `工具呼叫結果 (${m.name})`}</div>
                    <div style={styles.msgBody}>
                      {renderMarkdownLike(m.parts.map((p) => p.text).join('\n'))}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div style={{ ...styles.msg, ...styles.assistant }}>
                    <div style={styles.msgRole}>Gemini</div>
                    <div style={styles.msgBody}>思考中…</div>
                  </div>
                )}
              </div>

              {(error || aiSetupError) && (
                <div style={styles.error}>⚠ {error || aiSetupError}</div>
              )}

              {/* 輸入框 */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                style={styles.composer}
              >
                <input
                  placeholder="輸入問題，例如：請給我公有土地都更案的圖表"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading || !ai}
                  style={styles.textInput}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim() || !ai} 
                  style={styles.sendBtn}
                  className='sendBtn'
                >
                  送出
                </button>
              </form>

              {/* 快速問題建議 */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, padding: '0 12px 12px 12px' }}>
                {['請給我目前的公有土地都更案的圖表數據', '都更案件的流程說明', '哪個行政區的建設量最大？'].map((q) => (
                  <button key={q} type="button" style={styles.suggestion} onClick={() => sendMessage(q)} disabled={loading || !ai} className='suggestion'>{q}</button>
                ))}
              </div>

              {/* 底部資訊 */}
              <div style={{ fontSize: 12, opacity: 0.7, padding: '0 12px 12px 12px', textAlign: 'center' }}>
              </div>
          </div>
          
          {/* 右欄：圖表顯示區 */}
          <div style={mainContainerStyles.graphCard}>
              <GraphDisplay chartData={latestChartData} />
          </div>
      </div>
    </div>
  );
}

// ----------------------------- Styles ------------------------------------

// 圖表專用樣式
const graphStyles: Record<string, React.CSSProperties> = {
  box: {
    minHeight: 250,
    background: '#fff',
    border: '2px solid #e5e7eb',
    borderRadius: 16,
    padding: 16,
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
    // justify-content: 'center', // 移除，讓內容靠上
    alignItems: 'center',
    textAlign: 'center',
  },
  placeholder: {
    fontSize: 16,
    color: '#9ca3af',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#6b21a8',
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    color: '#374151',
    fontWeight: 500,
    margin: '0 0 10px 0',
  },
  dataArea: {
    padding: 10,
    background: '#f3f4f6',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#1f2937',
    wordBreak: 'break-all',
  },
  hint: {
    marginTop: 15,
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 1.4,
  }
};


// 新增主容器樣式
const mainContainerStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'grid',
    gap: 16,
    gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)', // 左右兩欄
    width: 'min(1200px, 100%)', // 擴大容器寬度
    margin: '0 auto',
  },
  chatCard: {
    background: '#fff',
    border: '2px solid #a78bfa',
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0 6px 10px rgba(0,0,0,0.15)',
  },
  graphCard: {
    alignSelf: 'stretch',
    paddingTop: 48, // 留出和左側 header 差不多高度的空間 (styles.header 高度 + padding)
  }
};


const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'grid', placeItems: 'start', padding: 16, width: '100%', background: '#f9f8ff' },
  header: {
    padding: '10px 12px',
    fontWeight: 700,
    borderBottom: '2px solid #d8b4fe',
    background: 'linear-gradient(90deg, #d8b4fe, #a78bfa)',
    color: '#1f1f1f',
    fontSize: 16,
  },
  messages: {
    padding: 12,
    display: 'grid',
    gap: 10,
    maxHeight: 400,
    overflow: 'auto',
    background: '#fff',
  },
  msg: {
    borderRadius: 16,
    padding: 10,
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  user: {
    background: '#f3e8ff',
    borderColor: '#c4b5fd',
    alignSelf: 'end',
  },
  assistant: {
    background: '#f5f3ff',
    borderColor: '#d8b4fe',
    alignSelf: 'start',
  },
  toolCall: { // 新增工具呼叫結果的樣式
    background: '#e0f2fe',
    borderColor: '#7dd3fc',
    alignSelf: 'start',
  },
  msgRole: {
    fontSize: 12,
    fontWeight: 700,
    color: '#6b21a8',
    marginBottom: 6,
  },
  msgBody: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#1f1f1f',
  },
  error: {
    color: '#b91c1c',
    padding: '4px 12px',
    background: '#fee2e2',
    borderRadius: 8,
    margin: '0 12px 12px',
  },
  composer: {
    padding: 12,
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 8,
    borderTop: '1px solid #e5e7eb',
    background: '#faf5ff',
  },
  textInput: {
    padding: '10px 12px',
    borderRadius: 999,
    border: '2px solid #d8b4fe',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
    color: '#1f1f1f',
    background: '#fff',
  },
  sendBtn: {
    padding: '10px 16px',
    borderRadius: 999,
    border: '2px solid #1f1f1f',
    background: '#a78bfa',
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'transform 0.15s, background 0.2s',
  },
  suggestion: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid #a78bfa',
    background: '#f3e8ff',
    cursor: 'pointer',
    fontSize: 12,
    color: '#1f1f1f',
    transition: 'background 0.2s, transform 0.15s',
  },
};