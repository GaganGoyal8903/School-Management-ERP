import { useState } from 'react';
import { Sparkles, BookOpen, FileQuestion, ClipboardList, Loader2, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const AITools = () => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('lesson');
  const [generatedContent, setGeneratedContent] = useState('');
  const [copied, setCopied] = useState(false);

  const [lessonPlanData, setLessonPlanData] = useState({
    subject: '',
    topic: '',
    grade: 'Class 10',
    duration: '45',
    objectives: ''
  });

  const [quizData, setQuizData] = useState({
    subject: '',
    topic: '',
    grade: 'Class 10',
    numQuestions: '10',
    difficulty: 'Medium'
  });

  const [homeworkData, setHomeworkData] = useState({
    subject: '',
    topic: '',
    grade: 'Class 10',
    numQuestions: '5',
    type: 'Mixed'
  });

  const handleGenerate = async (type) => {
    setLoading(true);
    setGeneratedContent('');

    // Simulate AI generation (in production, this would call the actual API)
    setTimeout(() => {
      let content = '';
      
      if (type === 'lesson') {
        content = generateSampleLessonPlan(lessonPlanData);
      } else if (type === 'quiz') {
        content = generateSampleQuiz(quizData);
      } else if (type === 'homework') {
        content = generateSampleHomework(homeworkData);
      }

      setGeneratedContent(content);
      setLoading(false);
    }, 2000);
  };

  const generateSampleLessonPlan = (data) => {
    return `
# Lesson Plan: ${data.topic}
## Subject: ${data.subject} | Grade: ${data.grade} | Duration: ${data.duration} minutes

### Learning Objectives
By the end of this lesson, students will be able to:
1. Understand the fundamental concepts of ${data.topic}
2. Apply knowledge to solve practical problems
3. Analyze and evaluate different scenarios related to ${data.topic}

### Materials Required
- ${data.subject} textbook
- Whiteboard and markers
- Visual aids and diagrams
- Worksheet for practice

### Lesson Structure

#### Introduction (5 minutes)
- Begin with a real-life example related to ${data.topic}
- Ask students what they already know about the topic
- Present learning objectives

#### Direct Instruction (15 minutes)
- Explain key concepts of ${data.topic}
- Use visual aids to illustrate main points
- Provide examples from everyday life

#### Guided Practice (15 minutes)
- Students work in pairs to solve problems
- Teacher circulates and provides feedback
- Discuss common mistakes and misconceptions

#### Independent Practice (8 minutes)
- Students complete worksheet individually
- Apply learned concepts to new situations

#### Closure (2 minutes)
- Recap main points of the lesson
- Preview next topic
- Assign homework

### Assessment
- Observation during group work
- Worksheet completion
- Exit ticket: "One thing I learned today..."
    `.trim();
  };

  const generateSampleQuiz = (data) => {
    const questions = [];
    for (let i = 1; i <= parseInt(data.numQuestions); i++) {
      questions.push(`
${i}. Question about ${data.topic} (Difficulty: ${data.difficulty})
   a) Option A
   b) Option B
   c) Option C
   d) Option D
   Answer: c
      `.trim());
    }

    return `
# Quiz: ${data.topic}
## Subject: ${data.subject} | Grade: ${data.grade} | Total Questions: ${data.numQuestions}

${questions.join('\n\n')}

### Answer Key
${questions.map((_, i) => `${i + 1}. c`).join('\n')}
    `.trim();
  };

  const generateSampleHomework = (data) => {
    return `
# Homework Assignment: ${data.topic}
## Subject: ${data.subject} | Grade: ${data.grade}

### Instructions
Complete the following questions related to ${data.topic}. Show all your work.

### Questions

1. Define and explain the main concept of ${data.topic}. (5 marks)

2. Solve the following problem related to ${data.topic}:
   [Practice problem here]

3. Give examples of how ${data.topic} is used in real life. (3 marks)

4. Explain the relationship between ${data.topic} and related concepts. (4 marks)

5. A scenario-based question requiring application of ${data.topic} concepts. (8 marks)

### Submission Guidelines
- Submit by next class
- Write neatly and show all work
- For diagrams, use proper labeling
    `.trim();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const subjects = ['Mathematics', 'Science', 'English', 'History', 'Geography', 'Physics', 'Chemistry', 'Biology'];
  const grades = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Tools for Teachers</h1>
          <p className="text-gray-500 mt-1">Generate lesson plans, quizzes, and homework with AI assistance</p>
        </div>
      </div>

      {/* Features Banner */}
      <div className="bg-gradient-to-r from-[#002366] to-[#001a4d] rounded-xl p-6 mb-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="w-6 h-6 text-[#C5A059]" />
          <h2 className="text-lg font-semibold">AI-Powered Content Generation</h2>
        </div>
        <p className="text-blue-200">Create professional educational content in seconds using OpenAI integration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setActiveTab('lesson'); setGeneratedContent(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
            activeTab === 'lesson' 
              ? 'bg-[#002366] text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Lesson Plan
        </button>
        <button
          onClick={() => { setActiveTab('quiz'); setGeneratedContent(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
            activeTab === 'quiz' 
              ? 'bg-[#002366] text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <FileQuestion className="w-4 h-4" />
          Quiz Generator
        </button>
        <button
          onClick={() => { setActiveTab('homework'); setGeneratedContent(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
            activeTab === 'homework' 
              ? 'bg-[#002366] text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Homework
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Generate Content</h2>
          
          {activeTab === 'lesson' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                <select
                  value={lessonPlanData.subject}
                  onChange={(e) => setLessonPlanData({ ...lessonPlanData, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                >
                  <option value="">Select Subject</option>
                  {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Topic *</label>
                <input
                  type="text"
                  value={lessonPlanData.topic}
                  onChange={(e) => setLessonPlanData({ ...lessonPlanData, topic: e.target.value })}
                  placeholder="e.g., Quadratic Equations"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
                  <select
                    value={lessonPlanData.grade}
                    onChange={(e) => setLessonPlanData({ ...lessonPlanData, grade: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                  >
                    {grades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
                  <input
                    type="number"
                    value={lessonPlanData.duration}
                    onChange={(e) => setLessonPlanData({ ...lessonPlanData, duration: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                  />
                </div>
              </div>
              <button
                onClick={() => handleGenerate('lesson')}
                disabled={loading || !lessonPlanData.subject || !lessonPlanData.topic}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d] disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate Lesson Plan
              </button>
            </div>
          )}

          {activeTab === 'quiz' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                <select
                  value={quizData.subject}
                  onChange={(e) => setQuizData({ ...quizData, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                >
                  <option value="">Select Subject</option>
                  {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Topic *</label>
                <input
                  type="text"
                  value={quizData.topic}
                  onChange={(e) => setQuizData({ ...quizData, topic: e.target.value })}
                  placeholder="e.g., Algebra"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
                  <select
                    value={quizData.grade}
                    onChange={(e) => setQuizData({ ...quizData, grade: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                  >
                    {grades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Number of Questions</label>
                  <input
                    type="number"
                    value={quizData.numQuestions}
                    onChange={(e) => setQuizData({ ...quizData, numQuestions: e.target.value })}
                    min="5"
                    max="20"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                <select
                  value={quizData.difficulty}
                  onChange={(e) => setQuizData({ ...quizData, difficulty: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
              <button
                onClick={() => handleGenerate('quiz')}
                disabled={loading || !quizData.subject || !quizData.topic}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d] disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate Quiz
              </button>
            </div>
          )}

          {activeTab === 'homework' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                <select
                  value={homeworkData.subject}
                  onChange={(e) => setHomeworkData({ ...homeworkData, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                >
                  <option value="">Select Subject</option>
                  {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Topic *</label>
                <input
                  type="text"
                  value={homeworkData.topic}
                  onChange={(e) => setHomeworkData({ ...homeworkData, topic: e.target.value })}
                  placeholder="e.g., Chemical Reactions"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
                  <select
                    value={homeworkData.grade}
                    onChange={(e) => setHomeworkData({ ...homeworkData, grade: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                  >
                    {grades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Number of Questions</label>
                  <input
                    type="number"
                    value={homeworkData.numQuestions}
                    onChange={(e) => setHomeworkData({ ...homeworkData, numQuestions: e.target.value })}
                    min="3"
                    max="10"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question Type</label>
                <select
                  value={homeworkData.type}
                  onChange={(e) => setHomeworkData({ ...homeworkData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                >
                  <option value="Mixed">Mixed</option>
                  <option value="Theory">Theory</option>
                  <option value="Numerical">Numerical</option>
                  <option value="Application">Application Based</option>
                </select>
              </div>
              <button
                onClick={() => handleGenerate('homework')}
                disabled={loading || !homeworkData.subject || !homeworkData.topic}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d] disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate Homework
              </button>
            </div>
          )}
        </div>

        {/* Output */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Generated Content</h2>
            {generatedContent && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-[#002366]"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p>Generating content...</p>
            </div>
          ) : generatedContent ? (
            <div className="prose prose-sm max-w-none h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-sans text-sm bg-gray-50 p-4 rounded-lg">
                {generatedContent}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Sparkles className="w-12 h-12 mb-2" />
              <p>Your generated content will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 rounded-xl p-4 border border-blue-100">
        <h3 className="font-medium text-blue-900 mb-2">💡 Tips for Better Results</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Be specific with your topic name for more accurate content</li>
          <li>• Adjust difficulty level based on your students' understanding</li>
          <li>• Review generated content before using in class</li>
          <li>• You can copy and modify the content as needed</li>
        </ul>
      </div>
    </div>
  );
};

export default AITools;

