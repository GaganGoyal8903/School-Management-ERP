const { asyncHandler } = require('../middleware/errorMiddleware');
const { buildPromptFriendlyContext } = require('../services/aiContextService');
const { createOpenAITextResponse } = require('../services/openaiResponseService');

const buildConversationHistory = (messages = []) =>
  (Array.isArray(messages) ? messages : [])
    .slice(-6)
    .map((message) => {
      const role = String(message?.role || '').trim().toLowerCase() === 'assistant' ? 'Assistant' : 'User';
      const content = String(message?.content || '').trim();
      return content ? `${role}: ${content}` : null;
    })
    .filter(Boolean)
    .join('\n');

const buildAssistantPrompt = ({ prompt, messages, user, contextResult }) => {
  const conversationHistory = buildConversationHistory(messages);
  const restrictedNotice = contextResult.restrictedTopics.length
    ? `Restricted topics for this user's role: ${contextResult.restrictedTopics.join(', ')}. If the user asks about these, explain that the current role cannot access them.`
    : 'No restricted topics were detected for this request.';

  return `
You are the School Management AI Assistant inside a school ERP.

Rules:
- Use the LIVE SCHOOL DATA CONTEXT for school-specific answers.
- Do not invent counts, names, fees, schedules, results, or attendance figures.
- If the live context does not contain the needed fact, say that clearly and then provide a helpful next step or a general draft.
- Keep answers concise, practical, and well structured.
- Respect the user's role and access scope.

Authenticated user:
- Role: ${String(user?.role || '').trim() || 'unknown'}
- User ID: ${String(user?._id || user?.id || '').trim() || 'unknown'}

${restrictedNotice}

Relevant live data topics: ${contextResult.topics.join(', ') || 'overview'}

Conversation so far:
${conversationHistory || 'No previous conversation context.'}

LIVE SCHOOL DATA CONTEXT:
${JSON.stringify(contextResult.context, null, 2)}

Current user request:
${String(prompt || '').trim()}
`.trim();
};

const buildLessonPrompt = ({ payload, user, contextResult }) => `
You are an academic planning assistant inside a school ERP.

Create a classroom-ready lesson plan in markdown using the provided request and the live school context when relevant.
Be specific, practical, and teacher-friendly.
If the live context does not provide something requested, make a clear assumption instead of inventing facts.

Authenticated role: ${String(user?.role || '').trim() || 'unknown'}
Relevant live data topics: ${contextResult.topics.join(', ') || 'overview'}

LIVE SCHOOL DATA CONTEXT:
${JSON.stringify(contextResult.context, null, 2)}

LESSON REQUEST:
${JSON.stringify(payload, null, 2)}

Return sections for:
- Title
- Learning objectives
- Materials needed
- Lesson flow with timings
- Checks for understanding
- Homework / follow-up
`.trim();

const buildQuizPrompt = ({ payload, user, contextResult }) => `
You are an assessment designer inside a school ERP.

Create a high-quality quiz in markdown using the request and the live school context when relevant.
Make the difficulty and number of questions match the request.
If the live context does not contain enough school-specific detail, create a strong subject-based quiz and state assumptions briefly.

Authenticated role: ${String(user?.role || '').trim() || 'unknown'}
Relevant live data topics: ${contextResult.topics.join(', ') || 'overview'}

LIVE SCHOOL DATA CONTEXT:
${JSON.stringify(contextResult.context, null, 2)}

QUIZ REQUEST:
${JSON.stringify(payload, null, 2)}

Return:
- Title
- Instructions
- Questions with options where appropriate
- Answer key
`.trim();

const buildHomeworkPrompt = ({ payload, user, contextResult }) => `
You are a homework planning assistant inside a school ERP.

Create a classroom-ready homework assignment in markdown using the request and the live school context when relevant.
Keep it aligned to the requested grade, topic, and homework style.
If the live context does not contain enough detail, generate a strong subject-based assignment and state assumptions briefly.

Authenticated role: ${String(user?.role || '').trim() || 'unknown'}
Relevant live data topics: ${contextResult.topics.join(', ') || 'overview'}

LIVE SCHOOL DATA CONTEXT:
${JSON.stringify(contextResult.context, null, 2)}

HOMEWORK REQUEST:
${JSON.stringify(payload, null, 2)}

Return:
- Title
- Instructions
- Questions/tasks
- Submission guidance
- Optional extension activity
`.trim();

const requireTextField = (value, fieldName) => {
  if (!String(value || '').trim()) {
    const error = new Error(`${fieldName} is required.`);
    error.statusCode = 400;
    throw error;
  }
};

const askSchoolAssistant = asyncHandler(async (req, res) => {
  const prompt = String(req.body.prompt || '').trim();
  requireTextField(prompt, 'Prompt');

  const contextResult = await buildPromptFriendlyContext({
    query: prompt,
    role: req.user?.role,
    userId: req.user?._id,
  });

  const response = await createOpenAITextResponse({
    prompt: buildAssistantPrompt({
      prompt,
      messages: req.body.messages,
      user: req.user,
      contextResult,
    }),
  });

  res.json({
    success: true,
    answer: response.text,
    model: response.model,
    topics: contextResult.topics,
    restrictedTopics: contextResult.restrictedTopics,
  });
});

const generateLessonPlan = asyncHandler(async (req, res) => {
  const payload = {
    subject: String(req.body.subject || '').trim(),
    topic: String(req.body.topic || '').trim(),
    grade: String(req.body.grade || '').trim(),
    duration: String(req.body.duration || '').trim(),
    objectives: String(req.body.objectives || '').trim(),
  };
  requireTextField(payload.subject, 'Subject');
  requireTextField(payload.topic, 'Topic');

  const contextResult = await buildPromptFriendlyContext({
    query: `${payload.subject} ${payload.topic} ${payload.grade}`.trim(),
    role: req.user?.role,
    userId: req.user?._id,
    explicitTopics: ['overview', 'subjects', 'materials'],
  });

  const response = await createOpenAITextResponse({
    prompt: buildLessonPrompt({ payload, user: req.user, contextResult }),
  });

  res.json({
    success: true,
    content: response.text,
    model: response.model,
    topics: contextResult.topics,
  });
});

const generateQuiz = asyncHandler(async (req, res) => {
  const payload = {
    subject: String(req.body.subject || '').trim(),
    topic: String(req.body.topic || '').trim(),
    grade: String(req.body.grade || '').trim(),
    numQuestions: String(req.body.numQuestions || '').trim(),
    difficulty: String(req.body.difficulty || '').trim(),
  };
  requireTextField(payload.subject, 'Subject');
  requireTextField(payload.topic, 'Topic');

  const contextResult = await buildPromptFriendlyContext({
    query: `${payload.subject} ${payload.topic} ${payload.grade}`.trim(),
    role: req.user?.role,
    userId: req.user?._id,
    explicitTopics: ['overview', 'subjects', 'materials', 'exams'],
  });

  const response = await createOpenAITextResponse({
    prompt: buildQuizPrompt({ payload, user: req.user, contextResult }),
  });

  res.json({
    success: true,
    content: response.text,
    model: response.model,
    topics: contextResult.topics,
  });
});

const generateHomework = asyncHandler(async (req, res) => {
  const payload = {
    subject: String(req.body.subject || '').trim(),
    topic: String(req.body.topic || '').trim(),
    grade: String(req.body.grade || '').trim(),
    numQuestions: String(req.body.numQuestions || '').trim(),
    type: String(req.body.type || '').trim(),
  };
  requireTextField(payload.subject, 'Subject');
  requireTextField(payload.topic, 'Topic');

  const contextResult = await buildPromptFriendlyContext({
    query: `${payload.subject} ${payload.topic} ${payload.grade}`.trim(),
    role: req.user?.role,
    userId: req.user?._id,
    explicitTopics: ['overview', 'subjects', 'materials'],
  });

  const response = await createOpenAITextResponse({
    prompt: buildHomeworkPrompt({ payload, user: req.user, contextResult }),
  });

  res.json({
    success: true,
    content: response.text,
    model: response.model,
    topics: contextResult.topics,
  });
});

module.exports = {
  askSchoolAssistant,
  generateLessonPlan,
  generateQuiz,
  generateHomework,
};
