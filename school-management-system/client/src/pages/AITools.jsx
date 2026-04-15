import { useState } from 'react';
import {
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  FileQuestion,
  Loader2,
  MessageSquareText,
  Send,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  askSchoolAssistant,
  generateHomework,
  generateLessonPlan,
  generateQuiz,
} from '../services/api';

const SUBJECT_OPTIONS = ['Mathematics', 'Science', 'English', 'History', 'Geography', 'Physics', 'Chemistry', 'Biology'];
const GRADE_OPTIONS = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
const ASSISTANT_SUGGESTIONS = [
  'Summarize the current student and attendance situation for the school.',
  'Create a lesson plan for Class 10 Mathematics on Quadratic Equations.',
  'Generate a quiz for Class 8 Science on Chemical Reactions.',
  'Give me a short briefing on exams, fees, and pending action items.',
];

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const tabConfig = [
  { key: 'assistant', label: 'School Assistant', icon: MessageSquareText },
  { key: 'lesson', label: 'Lesson Plan', icon: BookOpen },
  { key: 'quiz', label: 'Quiz Generator', icon: FileQuestion },
  { key: 'homework', label: 'Homework', icon: ClipboardList },
];

const buildGenerationBadgeText = (topics = []) =>
  Array.isArray(topics) && topics.length ? `Grounded in: ${topics.join(', ')}` : 'General AI generation';

const AITools = () => {
  const [activeTab, setActiveTab] = useState('assistant');
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [generatedTopics, setGeneratedTopics] = useState([]);
  const [copied, setCopied] = useState(false);

  const [lessonPlanData, setLessonPlanData] = useState({
    subject: '',
    topic: '',
    grade: 'Class 10',
    duration: '45',
    objectives: '',
  });
  const [quizData, setQuizData] = useState({
    subject: '',
    topic: '',
    grade: 'Class 10',
    numQuestions: '10',
    difficulty: 'Medium',
  });
  const [homeworkData, setHomeworkData] = useState({
    subject: '',
    topic: '',
    grade: 'Class 10',
    numQuestions: '5',
    type: 'Mixed',
  });

  const handleAssistantSubmit = async (promptOverride = null) => {
    const nextPrompt = String(promptOverride ?? assistantPrompt).trim();
    if (!nextPrompt) {
      toast.error('Please enter a question for the AI assistant.');
      return;
    }

    const nextUserMessage = { role: 'user', content: nextPrompt };
    const nextHistory = [...assistantMessages, nextUserMessage];

    setAssistantMessages(nextHistory);
    setAssistantPrompt('');
    setAssistantLoading(true);

    try {
      const response = await askSchoolAssistant({
        prompt: nextPrompt,
        messages: nextHistory.slice(-6).map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });

      setAssistantMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: response?.data?.answer || 'No answer was returned.',
          topics: response?.data?.topics || [],
          restrictedTopics: response?.data?.restrictedTopics || [],
        },
      ]);
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to reach the AI assistant.');
      setAssistantMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: message,
          topics: [],
          restrictedTopics: [],
          isError: true,
        },
      ]);
      toast.error(message);
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleGenerate = async (type) => {
    setGenerationLoading(true);
    setGeneratedContent('');
    setGeneratedTopics([]);

    try {
      let response;

      if (type === 'lesson') {
        response = await generateLessonPlan(lessonPlanData);
      } else if (type === 'quiz') {
        response = await generateQuiz(quizData);
      } else {
        response = await generateHomework(homeworkData);
      }

      setGeneratedContent(response?.data?.content || 'No content was returned.');
      setGeneratedTopics(response?.data?.topics || []);
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to generate AI content.');
      toast.error(message);
      setGeneratedContent(message);
      setGeneratedTopics([]);
    } finally {
      setGenerationLoading(false);
    }
  };

  const handleCopy = async (contentOverride = null) => {
    const textToCopy = String(contentOverride ?? generatedContent ?? '').trim();
    if (!textToCopy) {
      return;
    }

    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const renderFieldSelect = (label, value, onChange, options, placeholder = 'Select') => (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );

  const renderGenerationForm = () => {
    if (activeTab === 'lesson') {
      return (
        <div className="space-y-4">
          {renderFieldSelect(
            'Subject *',
            lessonPlanData.subject,
            (event) => setLessonPlanData((current) => ({ ...current, subject: event.target.value })),
            SUBJECT_OPTIONS
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Topic *</label>
            <input
              type="text"
              value={lessonPlanData.topic}
              onChange={(event) => setLessonPlanData((current) => ({ ...current, topic: event.target.value }))}
              placeholder="e.g., Quadratic Equations"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {renderFieldSelect(
              'Grade',
              lessonPlanData.grade,
              (event) => setLessonPlanData((current) => ({ ...current, grade: event.target.value })),
              GRADE_OPTIONS,
              'Select Grade'
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Duration (min)</label>
              <input
                type="number"
                value={lessonPlanData.duration}
                onChange={(event) => setLessonPlanData((current) => ({ ...current, duration: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Objectives</label>
            <textarea
              rows={4}
              value={lessonPlanData.objectives}
              onChange={(event) => setLessonPlanData((current) => ({ ...current, objectives: event.target.value }))}
              placeholder="Optional learning goals or constraints"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <button
            type="button"
            onClick={() => handleGenerate('lesson')}
            disabled={generationLoading || !lessonPlanData.subject || !lessonPlanData.topic}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-white hover:bg-[#001a4d] disabled:opacity-50"
          >
            {generationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Lesson Plan
          </button>
        </div>
      );
    }

    if (activeTab === 'quiz') {
      return (
        <div className="space-y-4">
          {renderFieldSelect(
            'Subject *',
            quizData.subject,
            (event) => setQuizData((current) => ({ ...current, subject: event.target.value })),
            SUBJECT_OPTIONS
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Topic *</label>
            <input
              type="text"
              value={quizData.topic}
              onChange={(event) => setQuizData((current) => ({ ...current, topic: event.target.value }))}
              placeholder="e.g., Algebra"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {renderFieldSelect(
              'Grade',
              quizData.grade,
              (event) => setQuizData((current) => ({ ...current, grade: event.target.value })),
              GRADE_OPTIONS,
              'Select Grade'
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Questions</label>
              <input
                type="number"
                min="5"
                max="25"
                value={quizData.numQuestions}
                onChange={(event) => setQuizData((current) => ({ ...current, numQuestions: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Difficulty</label>
            <select
              value={quizData.difficulty}
              onChange={(event) => setQuizData((current) => ({ ...current, difficulty: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => handleGenerate('quiz')}
            disabled={generationLoading || !quizData.subject || !quizData.topic}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-white hover:bg-[#001a4d] disabled:opacity-50"
          >
            {generationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Quiz
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {renderFieldSelect(
          'Subject *',
          homeworkData.subject,
          (event) => setHomeworkData((current) => ({ ...current, subject: event.target.value })),
          SUBJECT_OPTIONS
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Topic *</label>
          <input
            type="text"
            value={homeworkData.topic}
            onChange={(event) => setHomeworkData((current) => ({ ...current, topic: event.target.value }))}
            placeholder="e.g., Chemical Reactions"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {renderFieldSelect(
            'Grade',
            homeworkData.grade,
            (event) => setHomeworkData((current) => ({ ...current, grade: event.target.value })),
            GRADE_OPTIONS,
            'Select Grade'
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Questions</label>
            <input
              type="number"
              min="3"
              max="15"
              value={homeworkData.numQuestions}
              onChange={(event) => setHomeworkData((current) => ({ ...current, numQuestions: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Question Type</label>
          <select
            value={homeworkData.type}
            onChange={(event) => setHomeworkData((current) => ({ ...current, type: event.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
          >
            <option value="Mixed">Mixed</option>
            <option value="Theory">Theory</option>
            <option value="Numerical">Numerical</option>
            <option value="Application">Application Based</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => handleGenerate('homework')}
          disabled={generationLoading || !homeworkData.subject || !homeworkData.topic}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-white hover:bg-[#001a4d] disabled:opacity-50"
        >
          {generationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generate Homework
        </button>
      </div>
    );
  };

  const renderAssistantForm = () => (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Ask the school assistant</label>
        <textarea
          rows={6}
          value={assistantPrompt}
          onChange={(event) => setAssistantPrompt(event.target.value)}
          placeholder="Ask about students, attendance, exams, fees, timetable, materials, or ask it to generate school content using live context."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {ASSISTANT_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => handleAssistantSubmit(suggestion)}
            disabled={assistantLoading}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => handleAssistantSubmit()}
        disabled={assistantLoading || !assistantPrompt.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-white hover:bg-[#001a4d] disabled:opacity-50"
      >
        {assistantLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Ask AI Assistant
      </button>
    </div>
  );

  const renderAssistantOutput = () => (
    <div className="space-y-4">
      {assistantMessages.length ? (
        <div className="h-[32rem] space-y-3 overflow-y-auto pr-1">
          {assistantMessages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-xl border p-4 ${
                message.role === 'user'
                  ? 'border-blue-100 bg-blue-50'
                  : message.isError
                    ? 'border-red-200 bg-red-50'
                    : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">
                  {message.role === 'user' ? 'You' : 'School AI Assistant'}
                </p>
                {message.role === 'assistant' && message.content ? (
                  <button
                    type="button"
                    onClick={() => handleCopy(message.content)}
                    className="text-xs font-medium text-slate-500 hover:text-[#002366]"
                  >
                    Copy
                  </button>
                ) : null}
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">
                {message.content}
              </pre>
              {message.role === 'assistant' && Array.isArray(message.topics) && message.topics.length ? (
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Grounded in: {message.topics.join(', ')}
                </p>
              ) : null}
              {message.role === 'assistant' && Array.isArray(message.restrictedTopics) && message.restrictedTopics.length ? (
                <p className="mt-2 text-xs text-amber-700">
                  Restricted for your role: {message.restrictedTopics.join(', ')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-[32rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-slate-500">
          <MessageSquareText className="mb-3 h-12 w-12 text-slate-300" />
          <p className="font-medium text-slate-700">Ask about anything in the school system</p>
          <p className="mt-2 max-w-md text-sm">
            The assistant will pull related live data from the school ERP where available and then generate an answer from that context.
          </p>
        </div>
      )}
    </div>
  );

  const renderGenerationOutput = () => (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Generated Content</h2>
          {generatedContent ? (
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              {buildGenerationBadgeText(generatedTopics)}
            </p>
          ) : null}
        </div>
        {generatedContent ? (
          <button
            type="button"
            onClick={() => handleCopy()}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-[#002366]"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        ) : null}
      </div>

      {generationLoading ? (
        <div className="flex h-96 flex-col items-center justify-center text-gray-500">
          <Loader2 className="mb-2 h-8 w-8 animate-spin" />
          <p>Generating with live AI...</p>
        </div>
      ) : generatedContent ? (
        <div className="h-96 overflow-y-auto rounded-lg bg-gray-50 p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{generatedContent}</pre>
        </div>
      ) : (
        <div className="flex h-96 flex-col items-center justify-center text-gray-400">
          <Sparkles className="mb-2 h-12 w-12" />
          <p>Your AI-generated content will appear here</p>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Tools</h1>
          <p className="mt-1 text-gray-500">
            Real OpenAI-powered assistance with live school data grounding for the relevant topic
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-xl bg-gradient-to-r from-[#002366] to-[#001a4d] p-6 text-white">
        <div className="mb-2 flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-[#C5A059]" />
          <h2 className="text-lg font-semibold">Live School AI Workspace</h2>
        </div>
        <p className="text-blue-200">
          Ask school questions, generate teaching content, and let the assistant use live ERP data from the related module when it is available for your role.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabConfig.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key);
              setCopied(false);
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 transition ${
              activeTab === tab.key
                ? 'bg-[#002366] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            {activeTab === 'assistant' ? 'Ask AI Assistant' : 'Generate Content'}
          </h2>
          {activeTab === 'assistant' ? renderAssistantForm() : renderGenerationForm()}
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          {activeTab === 'assistant' ? renderAssistantOutput() : renderGenerationOutput()}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <h3 className="mb-2 font-medium text-blue-900">Usage Notes</h3>
        <ul className="space-y-1 text-sm text-blue-800">
          <li>Use the assistant tab for free-form questions about students, attendance, exams, fees, materials, buses, or timetable.</li>
          <li>The lesson plan, quiz, and homework tools now call the real AI backend instead of local sample text.</li>
          <li>If live data is missing for a request, the assistant will say so and then make a clear assumption-based draft instead of inventing numbers.</li>
          <li>If `OPENAI_API_KEY` is missing in the server environment, the page will show a clear backend error instead of silently faking output.</li>
        </ul>
      </div>
    </div>
  );
};

export default AITools;
