/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { 
  Plus, 
  Settings, 
  Copy, 
  Check, 
  RefreshCw, 
  ChevronRight, 
  ChevronDown,
  Coffee, 
  X, 
  Sparkles,
  Info,
  ExternalLink,
  Target,
  PenTool,
  Clock3,
  Share2,
  Download,
  Flame,
  Zap,
  BookOpen,
  Mic,
  MicOff,
  ArrowDown,
  Lightbulb,
  Twitter,
  MessageCircle,
  Link as LinkIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from '@google/genai';
import ReactGA from 'react-ga4';

// --- Types ---
interface GeneratedPrompt {
  id: string;
  title: string;
  content: string;
  type: string;
}

interface GuideData {
  audience: string;
  tone: string;
  wordCount: string;
}

// --- Utils ---
const IS_UNLIMITED_MODE = false; // Testing ke liye true kiya hai
const STORAGE_KEY_USAGE = 'clearprompt_usage_count';
const STORAGE_KEY_DATE = 'clearprompt_last_date';
const STORAGE_KEY_API_KEY = 'clearprompt_api_key';
const STORAGE_KEY_HISTORY = 'clearprompt_history';

const getInitialUsageCount = () => {
  const lastDate = localStorage.getItem(STORAGE_KEY_DATE);
  const today = new Date().toDateString();
  
  if (lastDate !== today) {
    localStorage.setItem(STORAGE_KEY_DATE, today);
    localStorage.setItem(STORAGE_KEY_USAGE, '0');
    return 0;
  }
  
  const count = localStorage.getItem(STORAGE_KEY_USAGE);
  return count ? parseInt(count, 10) : 0;
};

// --- Components ---

const LoadingSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm flex flex-col justify-between min-h-[160px]">
        <div className="space-y-3">
          <div className="h-3 w-full shimmer-bg rounded-lg"></div>
          <div className="h-3 w-[85%] shimmer-bg rounded-lg"></div>
          <div className="h-3 w-[70%] shimmer-bg rounded-lg"></div>
        </div>
        <div className="mt-6">
          <div className="h-3 w-12 shimmer-bg rounded-md"></div>
        </div>
      </div>
    ))}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-[2rem] w-full max-w-3xl overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between p-8 border-b border-slate-50">
          <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [mode, setMode] = useState<'Text' | 'Image'>('Text');
  const [idea, setIdea] = useState('');
  const [category, setCategory] = useState('General');
  const [model, setModel] = useState('Google Gemini');
  const [isTrending, setIsTrending] = useState(false);
  const [isRoastMode, setIsRoastMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [history, setHistory] = useState<GeneratedPrompt[]>([]);
  const [usageCount, setUsageCount] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [storedApiKey, setStoredApiKey] = useState('');
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  
  // Share Button State
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const shareUrl = "https://corepromptai.com/";
  const shareText = "Check out CorePrompt AI - The ultimate prompt engineering tool by Divyansh Singh (YASH)! 🚀";
  
  const resultsRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Modal States
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isHelpDecideModalOpen, setIsHelpDecideModalOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<GeneratedPrompt | null>(null);
  
  // Guide Form State
  const [guideForm, setGuideForm] = useState<GuideData>({
    audience: '',
    tone: '',
    wordCount: ''
  });

  const [helpDecideStep, setHelpDecideStep] = useState(1);
  const [helpDecideSelections, setHelpDecideSelections] = useState({
    goal: '',
    tone: '',
    audience: ''
  });

  const helpDecideOptions = {
    goal: ["Social Media Post", "Academic Essay", "Business Email", "Creative Story", "Technical Code"],
    tone: ["Professional", "Funny", "Sarcastic", "Serious", "Simple"],
    audience: ["Experts", "Beginners", "Kids", "General Public"]
  };

  const textModels = ['Google Gemini', 'ChatGPT', 'Claude', 'Grok', 'Perplexity AI'];
  const imageModels = ['Imagen 3 (for Gemini)', 'DALL-E 3 (for ChatGPT)', 'Grok Image Generator (Flux.1)'];
  const categories = ['General', 'Academic', 'Content Creator', 'SEO/Business', 'AI Avatars & Portraits'];

  const creationStyles = [
    { icon: "✒️", title: "Minimalist Logo", prompt: "A minimalist, professional negative space logo design for [Concept], vector, geometric, premium look, white background." },
    { icon: "🎨", title: "Corporate Flat Vector", prompt: "A modern flat vector illustration of [Subject], corporate style, minimalist, gradient accents, clean shapes." },
    { icon: "📐", title: "Brand Style Guide", prompt: "Create a complete visual brand identity for [Brand Name]. Suggest a premium color palette, typography, and brand vibe." },
    { icon: "🛍️", title: "3D Product Render", prompt: "A photorealistic 3D product render of [Product], studio lighting, soft shadows, octane render, cinematic, high detail." },
    { icon: "🏠", title: "Architectural Viz", prompt: "A high-end architectural exterior render of a modern [Building], golden hour lighting, hyper-realistic textures." },
    { icon: "📸", title: "Editorial Fashion", prompt: "A high-fashion editorial photograph, sophisticated attire, dramatic cinematic lighting, shot on Hasselblad, background blur." },
    { icon: "💻", title: "Isometric Tech Art", prompt: "A modern isometric 3D illustration of [Tech Concept], soft pastel colors, octane render, suitable for SaaS landing page." },
    { icon: "📱", title: "Glassmorphism UI", prompt: "A futuristic glassmorphism UI card design for [App Interface], blurred background, neon accents, frosted glass effect." },
    { icon: "🌑", title: "Dark Moody Aesthetic", prompt: "A deep, moody, high-contrast cinematic shot of [Subject], 'Interstellar' color grading, anamorphic lens flares." }
  ];

const studentTemplates = [
    { stream: "Science", icon: "⚛️", title: "Research Breakdown", prompt: "Summarize this advanced scientific paper into an Executive Summary. Focus on Methodology, Key Results, and Applications." },
    { stream: "Science", icon: "🧪", title: "Patent Ideator", prompt: "Act as an R&D Scientist. Help me refine the technical feasibility of [Idea] and suggest 3 innovations to make it patentable." },
    { stream: "Science", icon: "🧬", title: "Data Viz Logic", prompt: "I have a dataset about [Topic]. Suggest the best charts to represent this data and explain the 'Why' for a scientific journal." },
    { stream: "Commerce", icon: "📈", title: "Market GTM Strategy", prompt: "Act as a Management Consultant. Create a detailed Go-to-Market strategy for a new startup in the [Industry] sector." },
    { stream: "Commerce", icon: "💰", title: "SaaS Financial Model", prompt: "Explain how to build a 3-year financial projection for a SaaS. Detail CAC, LTV, and Churn Rate calculation logic." },
    { stream: "Commerce", icon: "⚖️", title: "Legal & Compliance", prompt: "Act as a Corporate Lawyer. List the key legal documents and compliance requirements needed for a startup in India." },
    { stream: "Arts", icon: "🎨", title: "UX Design Psychology", prompt: "Analyze psychological principles like Gestalt or Hick's Law for a landing page design for [App Type]." },
    { stream: "Arts", icon: "📝", title: "Brand Storytelling", prompt: "Act as a Creative Director. Develop a 12-month content narrative and storytelling strategy for a brand in [Niche]." },
    { stream: "Arts", icon: "🎬", title: "Viral Script Hook", prompt: "Create 5 'High-Retention' hooks for a short video about [Topic], based on viral psychology." },
    { stream: "General", icon: "🚀", title: "Pro Cold Emailer", prompt: "Write a high-converting, personalized cold email to a Senior Executive for a [Role]. Focus on a Value-First approach." },
    { stream: "General", icon: "🤝", title: "LinkedIn Optimizer", prompt: "Rewrite my professional summary: '[Insert Summary]'. Optimize for SEO and sound authoritative yet approachable." },
    { stream: "General", icon: "🎙️", title: "STAR Interview Prep", prompt: "I am interviewing for [Role]. Generate 5 behavioral questions and help me structure STAR method answers." }
  ];

  const guideTips = [
    { icon: "🎭", title: "1. Assign a Role", desc: "Tell the AI who to be. (e.g., 'Act as a Senior UX Designer').", example: "Act as a Senior UX Designer with 10 years of experience. I want to build a landing page for an AI tool. What are the 3 most important sections I must include?" },
    { icon: "🎯", title: "2. Define the Task Clearly", desc: "Be brutally specific about your end goal.", example: "I need to write a 500-word blog post explaining Quantum Computing to high school students. Use simple analogies and no complex math." },
    { icon: "📏", title: "3. Set Strict Constraints", desc: "Tell the AI what NOT to do.", example: "Write a polite email declining a job offer. Keep it strictly under 100 words, do not use corporate jargon, and do not apologize excessively." },
    { icon: "🎨", title: "4. Specify the Format", desc: "Ask for a 'Markdown Table', 'JSON', or 'Step-by-step'.", example: "Compare React and Vue.js. Output the answer strictly as a Markdown table with 4 columns: Feature, React, Vue.js, and Verdict." },
    { icon: "🗣️", title: "5. Nail the Tone", desc: "Define the vibe (e.g., 'Witty and sarcastic').", example: "Write a motivational speech about waking up early. Make the tone highly aggressive, brutally honest, and similar to a strict military drill instructor." },
    { icon: "🔄", title: "6. Provide Context", desc: "Give background information so the AI understands.", example: "Context: I am a 17-year-old developer launching my first AI SaaS tool on Netlify. Task: Write a short, engaging LinkedIn post announcing this launch to attract beta testers." }
  ];

  useEffect(() => {
    setUsageCount(getInitialUsageCount());
    const savedKey = localStorage.getItem(STORAGE_KEY_API_KEY);
    if (savedKey) setStoredApiKey(savedKey);
    
    const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (savedHistory) setHistory(JSON.parse(savedHistory));
  }, []);

  // Auto-scroll whenever prompts are updated
  useEffect(() => {
    if (prompts.length > 0 && !isLoading) {
      resultsRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  }, [prompts, isLoading]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) setShowScrollHint(false);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const initSpeechRecognition = () => {
    if (recognitionRef.current) return recognitionRef.current;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            currentTranscript += event.results[i][0].transcript;
          }
        }
        
        if (currentTranscript) {
          setIdea((prev) => {
            const baseText = prev.endsWith(' ') || prev === '' ? prev : prev + ' ';
            return baseText + currentTranscript;
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
          alert("Permission denied: Please enable microphone access in your browser settings to use voice input.");
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      return recognition;
    }
    return null;
  };

  const toggleMicrophone = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      const recognition = initSpeechRecognition();
      if (recognition) {
        try {
          recognition.start();
          setIsListening(true);
        } catch (e) {
          console.error("Mic start error", e);
        }
      } else {
        alert("Speech recognition is not supported in this browser. Please try Chrome or Edge.");
      }
    }
  };

  const handleModeChange = (newMode: 'Text' | 'Image') => {
    setMode(newMode);
    setModel(newMode === 'Text' ? 'Google Gemini' : 'Imagen 3 (for Gemini)');
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopyingId(id);
    setTimeout(() => setCopyingId(null), 2000);
  };

  const handleLaunch = (url: string, content: string, id: string) => {
    handleCopy(content, id);
    window.open(url, '_blank');
  };

  const saveApiKey = () => {
    localStorage.setItem(STORAGE_KEY_API_KEY, apiKey);
    setStoredApiKey(apiKey);
    setIsApiKeyModalOpen(false);
    setIsLimitModalOpen(false);
    setApiKey('');
  };

  const generatePrompts = async (customContext?: string) => {
    if (!IS_UNLIMITED_MODE && !storedApiKey && usageCount >= 5) {
      setIsLimitModalOpen(true);
      return;
    }

    if (!idea.trim() && !customContext) return;

    setIsLoading(true);
    
    // Track GA Event
    ReactGA.event({
      category: 'User',
      action: 'Generate Prompt',
      label: category
    });

    try {
      // YAHAN PAR TUMHARI API KEY DIRECTLY DAAL DI GAYI HAI
      const effectiveKey = storedApiKey || 'AIzaSyDBQP0mtOpxN_nM3tq8k4t51evHwPWjQbg';
      if (!effectiveKey) throw new Error('No API Key available');

      const ai = new GoogleGenAI({ apiKey: effectiveKey });
      
      let systemInstruction = `You are an expert Prompt Engineer. 
      The user might input their idea in Hinglish (Hindi written in English script) or pure Hindi. Detect this and automatically optimize the output into professional, clear, and high-quality English prompts.
      Generate 5 distinct variations of high-quality AI prompts based on the user's idea.
      Styles to provide: 
      1. Concise (efficient), 
      2. Comprehensive (context-rich), 
      3. Creative (role-playing), 
      4. Technical (structured), 
      5. Step-by-Step.
      Target model for optimization: ${model}.`;

      // Category logic
      if (category === 'Academic') {
        systemInstruction += ` Specialization: Academic. The user is a student/researcher. Act as a professor. Ensure the prompts include instructions for citations, formal academic language, and structural precision.`;
      } else if (category === 'Content Creator') {
        systemInstruction += ` Specialization: Content Creator. The user is a YouTuber/influencer. Focus on engaging hooks, viral titles, viewer retention hooks, and platform-specific formatting.`;
      } else if (category === 'SEO/Business') {
        systemInstruction += ` Specialization: SEO/Business. Focus on keyword density, search intent, professional meta-descriptions, and conversion-oriented language.`;
      } else if (category === 'AI Avatars & Portraits') {
        systemInstruction += ` Specialization: AI Avatars & Portraits. The user wants to generate a high-end self-portrait or avatar. 
        MANDATORY: Focus on photographic realism. Include details about lens choice (e.g., 85mm f/1.8), lighting (e.g., Rembrandt lighting, Golden Hour), camera settings (e.g., ISO 100, professional bokeh), and high-detail facial features. 
        Optimize for Midjourney or Flux/Grok. If the user provides face/hair details, ensure they are translated into descriptive visual prompts.`;
      }

      // Model optimization logic
      if (model.includes('DALL-E 3')) {
        systemInstruction += ` Optimization: DALL-E 3. This model handles long, descriptive, and imaginative paragraphs extremely well.`;
      } else if (model.includes('Imagen 3')) {
        systemInstruction += ` Optimization: Imagen 3. This model excels in artistic quality, photographic realism, and precise alignment with text descriptions.`;
      } else if (model.includes('Grok')) {
        systemInstruction += ` Optimization: Grok (Flux.1). This model is excellent at rendering text within images and following complex logical constraints.`;
      }

      systemInstruction += ` Return the response as a JSON array of objects with fields: title, content, type.`;

      if (isRoastMode) {
        systemInstruction += ` 
        CRITICAL ADDITION: Before the array of prompts, add a short "roast" section. 
        Act as a brutally honest, sarcastic internet commentator. 
        Mercilessly but humorously roast the user's raw idea in a mix of Hindi and English (Hinglish) for 2-3 sentences. 
        Then, add a separator "---" and provide the JSON array. 
        NOTE: Since you are returning application/json, include the roast as a field "roast" in the FIRST object of the array, or better, change the schema to include a top-level roast field.`;
      }

      let promptInput = customContext 
        ? `Idea: ${idea}. Context: ${customContext}` 
        : idea;

      if (isTrending) {
        promptInput += `. Focus on latest trending topics and current context related to ${idea}.`;
      }

      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: promptInput,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              roast: { type: Type.STRING },
              prompts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    content: { type: Type.STRING },
                    type: { type: Type.STRING }
                  },
                  required: ['title', 'content', 'type']
                }
              }
            },
            required: ['prompts']
          }
        }
      });

      const data = JSON.parse(result.text || '{}');
      const generated = (data.prompts || []).map((p: any) => ({
        ...p,
        id: Math.random().toString(36).substr(2, 9),
        roast: data.roast
      }));

      setPrompts(generated);
      setShowScrollHint(true);
      
      // Update history
      const newHistory = [generated[0], ...history].slice(0, 5);
      setHistory(newHistory);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(newHistory));
      
      // Update usage count only if using free trials and not in unlimited mode
      if (!IS_UNLIMITED_MODE && !storedApiKey) {
        const newCount = usageCount + 1;
        setUsageCount(newCount);
        localStorage.setItem(STORAGE_KEY_USAGE, newCount.toString());
      }
    } catch (error: any) {
      console.error('Error generating prompts:', error);
      setIsLoading(false);
      
      // Graceful handling of API limit or quota exhaustion
      if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota') || error?.message?.includes('exhausted')) {
        alert("Oops! Our free API limit for today is exhausted because of high traffic 🚀. Please enter your own Gemini API Key in Settings to continue, or come back tomorrow!");
      } else {
        alert("Something went wrong while crafting your prompt. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuideSubmit = () => {
    const context = `Target Audience: ${guideForm.audience}, Tone: ${guideForm.tone}, Max Word Count: ${guideForm.wordCount}`;
    generatePrompts(context);
    setIsGuideModalOpen(false);
  };


  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm transition-all h-20">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl creative-gradient flex items-center justify-center text-white shadow-md shadow-blue-200">
              <Sparkles size={22} fill="white" />
            </div>
            <span className="text-2xl font-extrabold tracking-tight text-slate-900">
              CorePrompt <span className="text-[var(--color-brand-primary)]">AI</span>
            </span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8">
            <a href="#" className="text-sm font-semibold text-slate-500 hover:text-[var(--color-brand-primary)] transition-colors">Categories</a>
            <a 
              href="https://www.buymeacoffee.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="coffee-btn px-6 py-2.5 rounded-full flex items-center gap-2 text-sm shadow-sm"
            >
              <Coffee size={18} fill="black" />
              Buy Me a Coffee
            </a>
            <button 
              onClick={() => setIsApiKeyModalOpen(true)}
              className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
            >
              <Settings size={22} />
              {storedApiKey && (
                <span className="absolute top-2 right-2 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
              )}
            </button>
          </nav>
          
          <button className="md:hidden p-2 text-slate-500">
            <Settings size={24} onClick={() => setIsApiKeyModalOpen(true)} />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 pt-12 pb-24">
        {/* Hero Section */}
        <section className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight"
          >
            Turn ideas into <span className="text-[var(--color-brand-primary)]">Perfect Prompts</span>
          </motion.h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-10">
            Stop struggling with AI logic. Describe your goal naturally, and CorePrompt AI will generate high-performing prompts for any AI model.
          </p>

          {/* Mode Toggle */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1">
              <button 
                onClick={() => handleModeChange('Text')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${mode === 'Text' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <PenTool size={16} />
                Text Mode
              </button>
              <button 
                onClick={() => handleModeChange('Image')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${mode === 'Image' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Sparkles size={16} />
                Image Mode
              </button>
            </div>
            
            <button 
              onClick={() => {
                setHelpDecideStep(1);
                setIsHelpDecideModalOpen(true);
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm"
            >
              <Info size={16} />
              Help me Decide
            </button>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
            {/* Category Selector */}
            <div className="mb-8">
              <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">Select Prompt Category</label>
              <div className="flex flex-wrap justify-center gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-5 py-2.5 rounded-full text-xs font-black transition-all border-2 ${
                      category === cat 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-105' 
                        : 'bg-white border-slate-100 text-slate-500 hover:border-blue-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mb-6">
              <textarea 
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    generatePrompts();
                  }
                }}
                placeholder={
                  category === 'AI Avatars & Portraits' 
                    ? "Describe your face/hair style, outfit, and desired background (e.g., Cyberpunk character with blue eyes, wearing a tech-jacket)..."
                    : category === 'Academic'
                    ? "Describe your research topic, essay theme, or study subject..."
                    : category === 'Content Creator'
                    ? "What's your video or post about? (e.g., 10 tips for healthy skin)..."
                    : category === 'SEO/Business'
                    ? "Describe your product, service, or business niche for SEO..."
                    : "Describe your prompt idea here (e.g., A blog post about AI in 2024)..."
                }
                className="w-full h-48 p-6 pr-20 text-lg border-2 border-slate-100 bg-slate-50 rounded-[1.5rem] shadow-sm focus:shadow-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all placeholder:text-slate-300"
              />
              <button
                onClick={toggleMicrophone}
                title={isListening ? "Stop listening" : "Start dictating"}
                className={`absolute right-4 top-4 p-3 rounded-full transition-all duration-300 ${
                  isListening 
                    ? 'bg-red-100 text-red-600 animate-pulse shadow-lg border border-red-300' 
                    : 'bg-white text-slate-400 hover:text-blue-500 shadow-sm'
                }`}
              >
                {isListening ? <Mic size={20} className="animate-bounce" /> : <Mic size={20} />}
              </button>
            </div>

            <div className="flex items-center gap-2 mb-6 px-2">
              <span className="text-xs text-slate-400 font-medium flex items-center gap-2">
                <Lightbulb size={14} className="text-amber-400" />
                💡 Pro Tip: Provide more details for highly accurate and faster results!
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 px-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={isTrending} 
                  onChange={(e) => setIsTrending(e.target.checked)}
                  className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                />
                <span className="text-sm font-bold text-slate-500 group-hover:text-slate-700 transition-colors">Focus on a Trending Topic?</span>
              </label>

              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-3">
                <div className="relative flex items-center bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-all group">
                  <select 
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="bg-transparent text-xs font-bold border-none rounded-xl pl-4 pr-10 py-3 text-slate-600 focus:ring-0 appearance-none cursor-pointer w-full"
                  >
                    {(mode === 'Text' ? textModels : imageModels).map(m => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 text-slate-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
                </div>
                
                <button
                  onClick={() => setIsRoastMode(!isRoastMode)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase transition-all border-2 ${
                    isRoastMode 
                      ? 'bg-orange-500 border-orange-500 text-white shadow-lg animate-pulse' 
                      : 'bg-white border-slate-100 text-slate-400 hover:border-orange-200 hover:text-orange-500 shadow-sm'
                  }`}
                >
                  <Flame size={16} fill={isRoastMode ? "white" : "none"} />
                  {isRoastMode ? "Roast ON" : "Roast Mode"}
                </button>

                <button 
                  disabled={isLoading || (!IS_UNLIMITED_MODE && !storedApiKey && usageCount >= 5)}
                  onClick={() => generatePrompts()}
                  className={`
                    px-8 py-3.5 rounded-xl font-bold flex items-center gap-3 transition-all creative-gradient text-white shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-[0.98]
                    ${isLoading ? 'opacity-70 cursor-wait' : ''}
                    ${(!IS_UNLIMITED_MODE && !storedApiKey && usageCount >= 5) ? 'grayscale opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {isLoading ? <RefreshCw className="animate-spin" size={20} /> : <Sparkles size={20} fill="white" />}
                  {(!IS_UNLIMITED_MODE && usageCount >= 5 && !storedApiKey) ? 'Limit Reached' : (isLoading ? 'Creating...' : 'Generate Prompts')}
                </button>
              </div>
            </div>

            {(!IS_UNLIMITED_MODE && usageCount >= 5 && !storedApiKey) && (
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 text-center text-amber-600 font-medium text-sm bg-amber-50 py-3 px-4 rounded-xl border border-amber-100"
              >
                You have reached your daily limit. Your 5 credits will reset after 24 hours. Stay tuned!
              </motion.p>
            )}

            {/* Prompt Strength Meter */}
            <div className="mb-8 px-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prompt Strength</span>
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                  idea.length === 0 ? 'text-slate-300' :
                  idea.length < 20 ? 'text-red-500' :
                  idea.length < 50 ? 'text-amber-500' :
                  'text-green-500'
                }`}>
                  {idea.length === 0 ? 'Empty' :
                   idea.length < 20 ? 'Very Weak' :
                   idea.length < 50 ? 'Improving' :
                   'Strong & Detailed'}
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ 
                    width: `${Math.min((idea.length / 80) * 100, 100)}%`,
                    backgroundColor: idea.length < 20 ? '#ef4444' : idea.length < 50 ? '#f59e0b' : '#10b981'
                  }}
                  className="h-full transition-colors duration-500"
                />
              </div>
            </div>
            {!IS_UNLIMITED_MODE && (
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div 
                        key={i} 
                        className={`w-3 h-3 rounded-full transition-colors duration-500 ${usageCount > i ? 'bg-amber-500' : 'bg-slate-200'}`} 
                      />
                    ))}
                  </div>
                  <span className="text-sm font-bold text-slate-500 uppercase tracking-widest ml-1">
                    {storedApiKey ? "Unlimited (BYOK Mode)" : `Daily Limit: ${usageCount}/5 prompts used`}
                  </span>
                  {storedApiKey && <span className="text-blue-500 font-bold text-xs uppercase tracking-tighter">⚡ PRO</span>}
                </div>
                <div className="text-xs text-slate-400 font-semibold tracking-tight">No credit card required for free use</div>
              </div>
            )}
          </div>
        </section>

        {/* Output Section */}
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.section 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-20"
            >
              <div className="flex items-center justify-between mb-10 px-4">
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <RefreshCw size={18} className="animate-spin" />
                  </div>
                  Crafting your prompts...
                </h2>
                <p className="text-slate-400 text-xs font-bold bg-slate-50 px-4 py-2 rounded-full border border-slate-100 animate-pulse">
                  If this helps you, consider supporting a student's education!
                </p>
              </div>
              <LoadingSkeleton />
            </motion.section>
          ) : prompts.length > 0 && (
            <motion.section 
              key="results"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="mb-20"
            >
              <div ref={resultsRef} className="scroll-mt-20" />
              <div className="flex items-center justify-between mb-10 px-4">
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Target size={18} />
                  </div>
                  Optimized Results
                </h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {prompts.map((p, idx) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedPrompt(p)}
                    className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm card-hover cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <p className="text-sm text-slate-600 leading-relaxed line-clamp-4 font-medium italic">
                        "{p.content}"
                      </p>
                    </div>
                    <div className="mt-6">
                      <span className={`text-[10px] font-black uppercase tracking-tighter inline-block px-2 py-0.5 rounded-md ${
                        idx === 0 ? 'text-blue-600 bg-blue-50' : 
                        idx === 1 ? 'text-purple-600 bg-purple-50' : 
                        idx === 2 ? 'text-pink-600 bg-pink-50' : 
                        idx === 3 ? 'text-green-600 bg-green-50' : 'text-orange-600 bg-orange-50'
                      }`}>
                        {p.type}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-16 flex justify-center">
                <button 
                  onClick={() => setIsGuideModalOpen(true)}
                  className="px-10 py-4 bg-white border-2 border-dashed border-slate-200 text-slate-500 rounded-2xl font-bold hover:border-blue-400 hover:text-blue-500 transition-all flex items-center gap-3 group"
                >
                  <Info size={20} className="group-hover:rotate-12 transition-transform" />
                  Not satisfied? Guide Me!
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* History Section */}
        {history.length > 0 && (
          <section className="mb-24 px-4">
             <div className="flex items-center gap-3 mb-8">
               <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                 <Clock3 size={18} />
               </div>
               <h2 className="text-xl font-bold text-slate-800 tracking-tight">Recent History</h2>
             </div>
             <div className="flex flex-wrap gap-3">
               {history.map((h, i) => (
                 <button
                    key={i}
                    onClick={() => {
                      setSelectedPrompt(h);
                    }}
                    className="px-5 py-3 rounded-2xl bg-white border border-slate-100 text-slate-600 text-sm font-semibold hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm flex items-center gap-3"
                 >
                   <span className="w-2 h-2 rounded-full bg-blue-400" />
                   {h.title}
                 </button>
               ))}
             </div>
          </section>
        )}
        {prompts.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300">
            <Sparkles size={64} className="mb-6 opacity-30" />
            <p className="text-xl font-medium">Ready to boost your productivity?</p>
            <p className="text-sm mt-2">Enter an idea above to see the magic</p>
          </div>
        )}

        <section className="mt-12 mb-10 bg-slate-50 border border-slate-200 rounded-[2rem] p-8 text-left">
          <div className="mb-8">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Lightbulb size={18} />
              </div>
              Prompt Engineering Masterclass
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-2">Master the art of talking to AI. Use this formula for perfect results.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {guideTips.map((tip, idx) => (
              <motion.button 
                key={idx} 
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setIdea(tip.example); // Assuming 'setIdea' is your main input state setter
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex gap-4 text-left p-4 rounded-xl hover:bg-white hover:shadow-md border border-transparent hover:border-indigo-100 transition-all cursor-pointer group"
              >
                <div className="text-2xl group-hover:scale-110 transition-transform">{tip.icon}</div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">{tip.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{tip.desc}</p>
                  <p className="text-[10px] font-semibold text-indigo-500 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click to try example prompt →</p>
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Popular Creation Styles */}
        <section className="mt-24 mb-12">
          <div className="flex items-center justify-between mb-8 px-4">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
                <Sparkles size={18} />
              </div>
              Professional Brand & Design Styles
            </h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-6 px-4">
            {creationStyles.map((style, idx) => (
              <motion.button
                key={idx}
                whileHover={{ y: -5 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setIdea(style.prompt);
                  setCategory('AI Avatars & Portraits');
                  setMode('Image');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex flex-col items-center gap-4 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-center group"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm transition-transform group-hover:scale-110 ${
                  idx === 0 ? 'bg-blue-50' : 
                  idx === 1 ? 'bg-red-50' : 
                  idx === 2 ? 'bg-amber-50' : 
                  idx === 3 ? 'bg-purple-50' : 
                  idx === 4 ? 'bg-pink-50' : 'bg-emerald-50'
                }`}>
                  {style.icon}
                </div>
                <span className="text-xs font-black text-slate-600 uppercase tracking-tighter leading-tight">
                  {style.title}
                </span>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Student Toolkit Section */}
        <section className="mt-16 mb-12">
          <div className="flex items-center justify-between mb-8 px-4">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Clock3 size={18} />
              </div>
              Ultimate Professional Toolkit
            </h2>
            <p className="text-sm font-bold text-slate-400 hidden sm:block">Advanced Templates for Academic & Professional Growth</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
            {studentTemplates.map((template, idx) => (
              <motion.button
                key={idx}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setIdea(template.prompt);
                  setCategory('Academic');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex flex-col items-start gap-4 bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left group"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="text-3xl">{template.icon}</div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md bg-slate-100 text-slate-600">
                    {template.stream}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">{template.title}</h4>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{template.prompt}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </section>
      </main>

      {/* Meet the Maker Section */}
      <section className="bg-slate-50 py-24 border-t border-slate-100">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Meet the Maker</h2>
            <p className="text-slate-500 font-medium">The builder behind CorePrompt AI.</p>
          </div>

          <div className="mb-16">
            <motion.div 
              whileHover={{ y: -8 }}
              className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col sm:flex-row items-center sm:items-start gap-8"
            >
              <div className="relative shrink-0">
                <div className="w-32 h-32 rounded-3xl overflow-hidden border-4 border-white shadow-lg rotate-3">
                  <img 
                    src="/founder.png" 
                    alt="Divyansh Singh (Yash) - Founder & Lead Builder" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://picsum.photos/seed/yash/400/400";
                    }}
                  />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-indigo-600 p-2 rounded-lg shadow-lg flex items-center justify-center -rotate-6">
                  <Flame size={16} className="text-white" fill="white" />
                </div>
              </div>
              <div className="space-y-4 text-center sm:text-left">
                <div>
                  <h3 className="text-xl font-black text-slate-900">Divyansh Singh (YASH)</h3>
                  <p className="text-indigo-600 font-bold text-sm uppercase tracking-wider">Founder & Lead Builder</p>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed font-medium">
                  Hi, I&apos;m Divyansh Singh (Yash), a 17-year-old student developer from a small city in UP, India. I&apos;m a self-taught builder creating tech right from my PC. Every contribution helps fund my higher education and the tech resources I need to keep building. Thank you for being part of my journey! ❤️
                </p>
              </div>
            </motion.div>
          </div>
          
          <div className="max-w-4xl mx-auto">
            <div className="bg-amber-50 p-8 rounded-[2rem] border border-amber-200 shadow-sm relative">
              <div className="absolute -top-4 -left-4 w-12 h-12 bg-amber-400 rounded-full flex items-center justify-center text-white shadow-lg">
                <Coffee size={24} fill="currentColor" />
              </div>
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 pl-4">
                <p className="text-slate-800 text-lg font-bold leading-relaxed italic max-w-xl">
                  "Every donation through Buy Me a Coffee goes directly toward my higher education and learning resources. Your support helps a small-town builder chase big dreams in tech with CorePrompt AI."
                </p>
                <a 
                  href="https://www.buymeacoffee.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-3 bg-[#FFDD00] text-black px-10 py-5 rounded-2xl font-black text-lg shadow-xl hover:shadow-2xl transition-all hover:scale-[1.03] active:scale-95"
                >
                  <Coffee size={24} fill="black" />
                  Support My Journey
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-white border-t border-slate-100 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-sm font-medium">© 2026 CorePrompt AI. Crafted for builders and creators.</p>
        </div>
      </footer>

      {/* Modals */}
      <AnimatePresence>
        {/* Limit Reached Modal */}
        {isLimitModalOpen && (
          <Modal isOpen={isLimitModalOpen} onClose={() => setIsLimitModalOpen(false)} title="Daily Limit Reached">
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500">
                <Info size={32} />
              </div>
              <div className="space-y-2">
                <p className="text-slate-600 font-medium">You've reached your free daily limit of 5 prompts.</p>
                <p className="text-slate-500 text-sm italic">Enter your own API Key for unlimited use.</p>
              </div>
              <div className="pt-4 space-y-4">
                <input 
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste your Gemini API Key here..."
                  className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none transition-all"
                />
                <button 
                  onClick={saveApiKey}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg"
                >
                  Activate Unlimited Access
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Settings Modal (API Key) */}
        {isApiKeyModalOpen && (
          <Modal isOpen={isApiKeyModalOpen} onClose={() => setIsApiKeyModalOpen(false)} title="Account Settings">
            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex gap-4">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600 shrink-0 h-fit">
                  <Info size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-blue-900 mb-1">Bring Your Own Key (BYOK)</h4>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    By providing your own API key, you bypass daily limits. Your key is stored safely in your browser's local storage and is never sent to our servers.
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Gemini API Key</label>
                <div className="relative">
                  <input 
                    type="password"
                    value={storedApiKey ? "••••••••••••••••••••" : apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={storedApiKey ? "Key stored" : "Enter API Key..."}
                    disabled={!!storedApiKey}
                    className="w-full p-4 pl-12 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none transition-all"
                  />
                  <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                  {storedApiKey && (
                    <button 
                      onClick={() => {
                        localStorage.removeItem(STORAGE_KEY_API_KEY);
                        setStoredApiKey('');
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-red-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {!storedApiKey && (
                <button 
                  onClick={saveApiKey}
                  className="w-full py-4 bg-[var(--color-brand-primary)] text-white rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg"
                >
                  Save API Key
                </button>
              )}
              
              <div className="pt-4 flex items-center justify-center gap-2 text-slate-400 text-xs">
                <span>Need a key?</span>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-500 font-bold hover:underline flex items-center gap-1">
                  Get one here <ExternalLink size={10} />
                </a>
              </div>
            </div>
          </Modal>
        )}

        {/* Guide Modal */}
        {isGuideModalOpen && (
          <Modal isOpen={isGuideModalOpen} onClose={() => setIsGuideModalOpen(false)} title="Guided Prompt Builder">
            <div className="space-y-6">
              <p className="text-slate-500 text-sm text-center">Help us refine your prompt by answering a few quick questions.</p>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Who is the target audience?</label>
                  <input 
                    type="text"
                    value={guideForm.audience}
                    onChange={(e) => setGuideForm({...guideForm, audience: e.target.value})}
                    placeholder="e.g. Busy professional, 5-year-old kid..."
                    className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-purple-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">What is the desired tone?</label>
                  <select 
                    value={guideForm.tone}
                    onChange={(e) => setGuideForm({...guideForm, tone: e.target.value})}
                    className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-purple-500 outline-none transition-all"
                  >
                    <option value="">Select a tone...</option>
                    <option value="Professional">Professional & Formal</option>
                    <option value="Casual">Casual & Conversational</option>
                    <option value="Humorous">Humorous & Witty</option>
                    <option value="Urgent">Urgent & Direct</option>
                    <option value="Empathetic">Empathetic & Supportive</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Target Word Count?</label>
                  <input 
                    type="text"
                    value={guideForm.wordCount}
                    onChange={(e) => setGuideForm({...guideForm, wordCount: e.target.value})}
                    placeholder="e.g. 50 words, 3 paragraphs..."
                    className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-purple-500 outline-none transition-all"
                  />
                </div>
              </div>

              <button 
                onClick={handleGuideSubmit}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl font-bold hover:shadow-xl transition-all mt-4"
              >
                Create Custom Prompt
              </button>
            </div>
          </Modal>
        )}

        {/* Help Me Decide Modal */}
        {isHelpDecideModalOpen && (
          <Modal 
            isOpen={isHelpDecideModalOpen} 
            onClose={() => setIsHelpDecideModalOpen(false)} 
            title={`Help me Decide (Step ${helpDecideStep}/3)`}
          >
            <div className="space-y-8">
              {helpDecideStep === 1 && (
                <div className="space-y-6">
                  <h4 className="text-lg font-bold text-slate-900 text-center">What are you creating?</h4>
                  <div className="flex flex-wrap justify-center gap-3">
                    {helpDecideOptions.goal.map((option) => (
                      <button
                        key={option}
                        onClick={() => setHelpDecideSelections({...helpDecideSelections, goal: option})}
                        className={`px-5 py-3 rounded-full text-sm font-bold transition-all border-2 ${
                          helpDecideSelections.goal === option 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                            : 'bg-white border-slate-100 text-slate-600 hover:border-blue-200'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {helpDecideStep === 2 && (
                <div className="space-y-6">
                  <h4 className="text-lg font-bold text-slate-900 text-center">What is the vibe?</h4>
                  <div className="flex flex-wrap justify-center gap-3">
                    {helpDecideOptions.tone.map((option) => (
                      <button
                        key={option}
                        onClick={() => setHelpDecideSelections({...helpDecideSelections, tone: option})}
                        className={`px-5 py-3 rounded-full text-sm font-bold transition-all border-2 ${
                          helpDecideSelections.tone === option 
                            ? 'bg-purple-600 border-purple-600 text-white shadow-md' 
                            : 'bg-white border-slate-100 text-slate-600 hover:border-purple-200'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {helpDecideStep === 3 && (
                <div className="space-y-6">
                  <h4 className="text-lg font-bold text-slate-900 text-center">Who is this for?</h4>
                  <div className="flex flex-wrap justify-center gap-3">
                    {helpDecideOptions.audience.map((option) => (
                      <button
                        key={option}
                        onClick={() => setHelpDecideSelections({...helpDecideSelections, audience: option})}
                        className={`px-5 py-3 rounded-full text-sm font-bold transition-all border-2 ${
                          helpDecideSelections.audience === option 
                            ? 'bg-amber-500 border-amber-500 text-white shadow-md' 
                            : 'bg-white border-slate-100 text-slate-600 hover:border-amber-200'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                {helpDecideStep > 1 && (
                  <button 
                    onClick={() => setHelpDecideStep(helpDecideStep - 1)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    Back
                  </button>
                )}
                
                {helpDecideStep < 3 ? (
                  <button 
                    disabled={
                      (helpDecideStep === 1 && !helpDecideSelections.goal) || 
                      (helpDecideStep === 2 && !helpDecideSelections.tone)
                    }
                    onClick={() => setHelpDecideStep(helpDecideStep + 1)}
                    className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Next Step
                  </button>
                ) : (
                  <button 
                    disabled={!helpDecideSelections.audience}
                    onClick={() => {
                      const finalPrompt = `I need to write a ${helpDecideSelections.goal} with a ${helpDecideSelections.tone} tone, specifically tailored for ${helpDecideSelections.audience}.`;
                      setIdea(finalPrompt);
                      setIsHelpDecideModalOpen(false);
                    }}
                    className="flex-[2] py-4 creative-gradient text-white rounded-2xl font-bold shadow-lg hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Finalize My Prompt
                  </button>
                )}
              </div>
            </div>
          </Modal>
        )}

        {/* Prompt Detail Modal */}
        {selectedPrompt && (
          <Modal isOpen={!!selectedPrompt} onClose={() => setSelectedPrompt(null)} title={selectedPrompt.type + ": " + selectedPrompt.title}>
            <div className="space-y-8">
              {/* Before vs After View */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-300" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Your Raw Idea</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl text-xs text-slate-500 font-medium italic border border-slate-100 min-h-[120px]">
                    {idea || "Selected from history"}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">CorePrompt Magic</span>
                  </div>
                  <div className="bg-blue-50/50 p-4 rounded-2xl text-xs text-blue-700 font-bold border border-blue-100 min-h-[120px]">
                    {selectedPrompt.content.substring(0, 100)}...
                  </div>
                </div>
              </div>

              {selectedPrompt && (selectedPrompt as any).roast && (
                <div className="bg-orange-50 border-2 border-orange-200 px-6 py-4 rounded-[2rem] relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 text-orange-200">
                    <Flame size={48} />
                  </div>
                  <h4 className="text-xs font-black uppercase text-orange-600 tracking-[0.2em] mb-2 flex items-center gap-2">
                    <Flame size={14} fill="currentColor" />
                    Brutal Roast
                  </h4>
                  <p className="text-orange-900 text-sm font-bold italic leading-relaxed relative z-10">
                    "{(selectedPrompt as any).roast}"
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Engineered Prompt</span>
                <div className="bg-slate-900 p-6 rounded-2xl font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-300 max-h-[300px] overflow-y-auto border border-slate-800 shadow-inner">
                  {selectedPrompt.content}
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <button 
                    onClick={() => handleLaunch('https://chatgpt.com/', selectedPrompt.content, selectedPrompt.id)}
                    className="flex items-center justify-center gap-2 py-4 bg-slate-800 text-white rounded-2xl font-bold hover:bg-slate-700 transition-all shadow-md active:scale-95 text-[10px] sm:text-xs px-2"
                  >
                    <Zap size={16} className="text-emerald-400" fill="currentColor" />
                    Launch ChatGPT ↗
                  </button>
                  <button 
                    onClick={() => handleLaunch('https://gemini.google.com/app', selectedPrompt.content, selectedPrompt.id)}
                    className="flex items-center justify-center gap-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 text-[10px] sm:text-xs px-2"
                  >
                    <Sparkles size={16} fill="white" />
                    Launch Gemini ✨
                  </button>
                  <button 
                    onClick={() => handleCopy(selectedPrompt.content, selectedPrompt.id)}
                    className="flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95 text-[10px] sm:text-xs px-2"
                  >
                    {copyingId === selectedPrompt.id ? <Check size={16} /> : <Copy size={16} />}
                    {copyingId === selectedPrompt.id ? 'Copied!' : 'Copy Only'}
                  </button>
                  <button 
                    onClick={() => setSelectedPrompt(null)}
                    className="flex items-center justify-center py-4 bg-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-300 transition-all text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showScrollHint && !isLoading && prompts.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 cursor-pointer"
          >
            <div className="bg-indigo-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-indigo-400 hover:bg-indigo-700 transition-all">
              <span className="text-sm font-bold tracking-wide">✨ Prompts are Ready!</span>
              <ArrowDown size={18} className="animate-bounce" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Share Button */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {isShareMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.9 }}
              className="flex flex-col gap-3 mb-2"
            >
              {/* WhatsApp Share */}
              <button 
                onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + " " + shareUrl)}`, '_blank')} 
                className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 transition-transform"
                title="Share on WhatsApp"
              >
                <MessageCircle size={22} fill="currentColor" />
              </button>
              
              {/* Twitter (X) Share */}
              <button 
                onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank')} 
                className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 transition-transform border border-slate-700"
                title="Share on X (Twitter)"
              >
                <Twitter size={20} fill="currentColor" />
              </button>

              {/* Copy Link */}
              <button 
                onClick={() => { 
                  navigator.clipboard.writeText(shareUrl); 
                  alert('Link Copied to Clipboard!'); 
                  setIsShareMenuOpen(false); 
                }} 
                className="w-12 h-12 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center shadow-xl hover:scale-110 transition-transform border border-slate-300"
                title="Copy Link"
              >
                <LinkIcon size={20} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Toggle Button */}
        <button
          onClick={() => setIsShareMenuOpen(!isShareMenuOpen)}
          className={`w-14 h-14 text-white rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95 ${isShareMenuOpen ? 'bg-slate-800' : 'creative-gradient hover:shadow-blue-200'}`}
        >
          {isShareMenuOpen ? <X size={24} /> : <Share2 size={24} />}
        </button>
      </div>
    </div>
  );
}
