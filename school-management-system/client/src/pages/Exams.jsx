import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, BookOpen } from "lucide-react";
import toast from "react-hot-toast";

import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";

import {
  getExams,
  createExam,
  updateExam,
  deleteExam,
  getSubjects,
  getExamPaperById,
  saveExamPaper,
} from "../services/api";

const createDefaultPaperQuestion = () => ({
  questionId: `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  questionType: "mcq",
  questionText: "",
  marks: 1,
  correctAnswer: "A",
  options: [
    { key: "A", text: "" },
    { key: "B", text: "" },
    { key: "C", text: "" },
    { key: "D", text: "" },
  ],
});

const padTimePart = (value) => String(value).padStart(2, "0");

const createDefaultExamFormState = () => {
  const now = new Date();
  const end = new Date(now.getTime() + (60 * 60 * 1000));
  const date = `${now.getFullYear()}-${padTimePart(now.getMonth() + 1)}-${padTimePart(now.getDate())}`;
  const startTime = `${padTimePart(now.getHours())}:${padTimePart(now.getMinutes())}`;
  const endTime = `${padTimePart(end.getHours())}:${padTimePart(end.getMinutes())}`;

  return {
    title: "",
    subject: "",
    grade: "Class 10",
    date,
    startTime,
    endTime,
    duration: 60,
    totalMarks: 100,
    instructions: "",
  };
};

const buildGradeOptions = (subjects = []) =>
  Array.from(
    new Set(
      subjects
        .map((subject) => String(subject?.grade || subject?.className || '').trim())
        .filter(Boolean)
    )
  );

const Exams = () => {
  const { isAdmin, isTeacher } = useAuth();

  const [exams, setExams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [showPaperModal, setShowPaperModal] = useState(false);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperSaving, setPaperSaving] = useState(false);
  const [paperExam, setPaperExam] = useState(null);
  const [paperForm, setPaperForm] = useState({
    title: "",
    instructions: "",
    durationMinutes: 60,
    allowInstantResult: true,
    questions: [createDefaultPaperQuestion()],
  });

  const [formData, setFormData] = useState(createDefaultExamFormState);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [examsRes, subjectsRes] = await Promise.all([
        getExams(),
        getSubjects()
      ]);

      const examsData = examsRes?.data?.exams;
      const subjectsData = subjectsRes?.data?.subjects;
      if (!Array.isArray(examsData) || !Array.isArray(subjectsData)) {
        throw new Error("Invalid exams response");
      }

      setExams(examsData);
      setSubjects(subjectsData);
      setLoadError("");
    } catch (error) {
      toast.error("Failed to fetch data");
      setLoadError("Unable to load live exam data from the backend API.");
      setExams([]);
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        ...formData,
        startTime: formData.startTime,
        endTime: formData.endTime,
        duration: Number(formData.duration),
        totalMarks: Number(formData.totalMarks)
      };

      if (editingExam) {
        await updateExam(editingExam._id, payload);
        toast.success("Exam updated successfully");
      } else {
        await createExam(payload);
        toast.success("Exam created successfully");
      }

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Operation failed");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this exam?")) return;

    try {
      await deleteExam(id);
      toast.success("Exam deleted successfully");
      fetchData();
    } catch {
      toast.error("Failed to delete exam");
    }
  };

  const resetForm = () => {
    setFormData(createDefaultExamFormState());

    setEditingExam(null);
  };

  const resetPaperForm = () => {
    setPaperForm({
      title: "",
      instructions: "",
      durationMinutes: 60,
      allowInstantResult: true,
      questions: [createDefaultPaperQuestion()],
    });
    setPaperExam(null);
  };

  const openEditModal = (exam) => {
    setEditingExam(exam);

    setFormData({
      title: exam.title || "",
      subject: exam.subject?._id || exam.subject || "",
      grade: exam.grade || "Class 10",
      date: exam.date ? exam.date.split("T")[0] : "",
      startTime: exam.startTime || "09:00",
      endTime: exam.endTime || "10:00",
      duration: exam.duration || 60,
      totalMarks: exam.totalMarks || 100,
      instructions: exam.instructions || ""
    });

    setShowModal(true);
  };

  const openPaperModal = async (exam) => {
    try {
      setPaperLoading(true);
      setPaperExam(exam);
      const response = await getExamPaperById(exam._id);
      const paper = response?.data?.paper || null;
      const questions = Array.isArray(response?.data?.questions) && response.data.questions.length > 0
        ? response.data.questions.map((question, index) => ({
            questionId: question.questionId || question.id || `question-${index + 1}`,
            questionType: question.questionType || "mcq",
            questionText: question.questionText || "",
            marks: question.marks || 1,
            correctAnswer: question.correctAnswer || "A",
            options: question.questionType === "short_answer"
              ? []
              : ["A", "B", "C", "D"].map((key) => ({
                  key,
                  text: question.options?.find((option) => option.key === key)?.text || "",
                })),
          }))
        : [createDefaultPaperQuestion()];

      setPaperForm({
        title: paper?.title || exam.title || "",
        instructions: paper?.instructions || exam.instructions || "",
        durationMinutes: paper?.durationMinutes || exam.duration || 60,
        allowInstantResult: paper?.allowInstantResult !== false,
        questions,
      });
      setShowPaperModal(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to load the exam paper.");
    } finally {
      setPaperLoading(false);
    }
  };

  const handlePaperQuestionChange = (questionId, updater) => {
    setPaperForm((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.questionId === questionId
          ? (typeof updater === "function" ? updater(question) : { ...question, ...updater })
          : question
      ),
    }));
  };

  const handleAddPaperQuestion = () => {
    setPaperForm((current) => ({
      ...current,
      questions: [
        ...current.questions,
        createDefaultPaperQuestion(),
      ],
    }));
  };

  const handleRemovePaperQuestion = (questionId) => {
    setPaperForm((current) => {
      const nextQuestions = current.questions.filter((question) => question.questionId !== questionId);
      return {
        ...current,
        questions: nextQuestions.length > 0 ? nextQuestions : [createDefaultPaperQuestion()],
      };
    });
  };

  const handleSavePaper = async (event) => {
    event.preventDefault();

    if (!paperExam?._id) {
      toast.error("Please select an exam first.");
      return;
    }

    try {
      setPaperSaving(true);
      await saveExamPaper(paperExam._id, {
        title: paperForm.title,
        instructions: paperForm.instructions,
        durationMinutes: Number(paperForm.durationMinutes),
        allowInstantResult: paperForm.allowInstantResult,
        questions: paperForm.questions.map((question, index) => ({
          questionType: question.questionType,
          questionText: question.questionText,
          marks: Number(question.marks),
          correctAnswer: question.correctAnswer,
          sortOrder: index + 1,
          options: question.questionType === "short_answer" ? [] : question.options,
        })),
      });
      toast.success("Exam paper saved successfully");
      setShowPaperModal(false);
      resetPaperForm();
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to save the exam paper.");
    } finally {
      setPaperSaving(false);
    }
  };

  const subjectOptions = Array.from(
    new Map(subjects.map((subject) => [subject.subjectId || subject._id, subject])).values()
  );
  const gradeOptions = buildGradeOptions(subjectOptions);

  const columns = [
    { key: "title", header: "Exam Title" },

    {
      key: "subject",
      header: "Subject",
      render: (row) => row?.subject?.name || row?.subject || "-"
    },

    { key: "grade", header: "Class" },

    {
      key: "date",
      header: "Date",
      render: (row) =>
        row?.date ? new Date(row.date).toLocaleDateString() : "-"
    },

    {
      key: "time",
      header: "Time",
      render: (row) => `${row?.startTime || "--:--"}${row?.endTime ? ` - ${row.endTime}` : ""}`
    },

    {
      key: "duration",
      header: "Duration",
      render: (row) => `${row?.duration || 0} min`
    },

    { key: "totalMarks", header: "Total Marks" },

    {
      key: "actions",
      header: "Actions",
      width: "120px",
      render: (row) => (
        <div className="flex items-center gap-2">
          {(isAdmin || isTeacher) && (
            <>
              <button
                onClick={() => openPaperModal(row)}
                className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600"
                title="Manage exam paper"
                disabled={paperLoading}
              >
                <BookOpen className="w-4 h-4" />
              </button>
              <button
                onClick={() => openEditModal(row)}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
              >
                <Edit className="w-4 h-4" />
              </button>

              {isAdmin && (
                <button
                  onClick={() => handleDelete(row._id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      )
    }
  ];

  const grades = gradeOptions.length ? gradeOptions : [
    "Class 1","Class 2","Class 3","Class 4","Class 5","Class 6",
    "Class 7","Class 8","Class 9","Class 10","Class 11","Class 12"
  ];

  return (
    <div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isTeacher ? "My Exams" : "Examinations"}</h1>
          {isTeacher ? (
            <p className="mt-1 text-sm text-gray-500">
              This workspace is scoped to the exams and papers for your assigned subjects.
            </p>
          ) : null}
        </div>

        {(isAdmin || isTeacher) && (
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
          >
            <Plus className="w-4 h-4" />
            Create Exam
          </button>
        )}
      </div>

      <DataTable columns={columns} data={exams} loading={loading} />
      {loadError ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingExam ? "Edit Exam" : "Create New Exam"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Exam Title *
            </label>

            <input
              type="text"
              required
              value={formData.title}
              onChange={(e)=>setFormData({...formData,title:e.target.value})}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          {/* Grid Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium mb-1">Subject *</label>

              <select
                required
                value={formData.subject}
                onChange={(e)=>{
                  const nextSubjectId = e.target.value;
                  const selectedSubject = subjectOptions.find(
                    (subject) => String(subject.subjectId || subject._id || '') === String(nextSubjectId)
                  );

                  setFormData({
                    ...formData,
                    subject: nextSubjectId,
                    grade: selectedSubject?.grade || selectedSubject?.className || formData.grade,
                  });
                }}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select Subject</option>
                {subjectOptions.map((s)=>(
                  <option key={s.classSubjectId || s._id} value={s.subjectId || s._id}>
                    {s.name}{s.grade ? ` • ${s.grade}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Class */}
            <div>
              <label className="block text-sm font-medium mb-1">Class *</label>

              <select
                value={formData.grade}
                onChange={(e)=>setFormData({...formData,grade:e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              >
                {grades.map((g)=>(
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium mb-1">Date *</label>

              <input
                type="date"
                required
                value={formData.date}
                onChange={(e)=>setFormData({...formData,date:e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium mb-1">Duration *</label>

              <input
                type="number"
                min="1"
                value={formData.duration}
                onChange={(e)=>setFormData({...formData,duration:e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            {/* Start Time */}
            <div>
              <label className="block text-sm font-medium mb-1">Start Time *</label>

              <input
                type="time"
                required
                value={formData.startTime}
                onChange={(e)=>setFormData({...formData,startTime:e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="block text-sm font-medium mb-1">End Time *</label>

              <input
                type="time"
                required
                value={formData.endTime}
                onChange={(e)=>setFormData({...formData,endTime:e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

          </div>

          {/* Total Marks */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Total Marks *
            </label>

            <input
              type="number"
              min="1"
              value={formData.totalMarks}
              onChange={(e)=>setFormData({...formData,totalMarks:e.target.value})}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Instructions
            </label>

            <textarea
              rows={3}
              value={formData.instructions}
              onChange={(e)=>setFormData({...formData,instructions:e.target.value})}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4">

            <button
              type="button"
              onClick={()=>{setShowModal(false);resetForm();}}
              className="px-4 py-2 border rounded-lg"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="px-4 py-2 bg-[#002366] text-white rounded-lg"
            >
              {editingExam ? "Update" : "Create"}
            </button>

          </div>

        </form>
      </Modal>

      <Modal
        isOpen={showPaperModal}
        onClose={() => { if (!paperSaving) { setShowPaperModal(false); resetPaperForm(); } }}
        title={`Manage Exam Paper${paperExam?.title ? ` - ${paperExam.title}` : ""}`}
        size="xl"
      >
        <form onSubmit={handleSavePaper} className="space-y-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Build the exam paper and answer sheet here. Students can start the test only when the exam date/time window opens.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Paper Title</label>
              <input
                type="text"
                value={paperForm.title}
                onChange={(e) => setPaperForm({ ...paperForm, title: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
              <input
                type="number"
                min="1"
                value={paperForm.durationMinutes}
                onChange={(e) => setPaperForm({ ...paperForm, durationMinutes: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Instructions</label>
            <textarea
              rows={3}
              value={paperForm.instructions}
              onChange={(e) => setPaperForm({ ...paperForm, instructions: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={paperForm.allowInstantResult}
              onChange={(e) => setPaperForm({ ...paperForm, allowInstantResult: e.target.checked })}
            />
            Show result instantly after student submission
          </label>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Questions & Answer Sheet</h3>
              <button
                type="button"
                onClick={handleAddPaperQuestion}
                className="px-3 py-2 rounded-lg bg-[#002366] text-white text-sm font-medium"
              >
                Add Question
              </button>
            </div>

            {paperForm.questions.map((question, index) => (
              <div key={question.questionId} className="rounded-xl border border-slate-200 p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-gray-900">Question {index + 1}</h4>
                  <button
                    type="button"
                    onClick={() => handleRemovePaperQuestion(question.questionId)}
                    className="text-sm font-medium text-red-600"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Question Text</label>
                    <textarea
                      rows={2}
                      value={question.questionText}
                      onChange={(e) => handlePaperQuestionChange(question.questionId, { questionText: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Type</label>
                      <select
                        value={question.questionType}
                        onChange={(e) => handlePaperQuestionChange(question.questionId, (currentQuestion) => ({
                          ...currentQuestion,
                          questionType: e.target.value,
                          correctAnswer: e.target.value === "short_answer" ? "" : "A",
                          options: e.target.value === "short_answer" ? [] : currentQuestion.options?.length ? currentQuestion.options : createDefaultPaperQuestion().options,
                        }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="mcq">MCQ</option>
                        <option value="short_answer">Short Answer</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Marks</label>
                      <input
                        type="number"
                        min="1"
                        value={question.marks}
                        onChange={(e) => handlePaperQuestionChange(question.questionId, { marks: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {question.questionType === "mcq" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {["A", "B", "C", "D"].map((optionKey) => (
                      <div key={optionKey}>
                        <label className="block text-sm font-medium mb-1">Option {optionKey}</label>
                        <input
                          type="text"
                          value={question.options?.find((option) => option.key === optionKey)?.text || ""}
                          onChange={(e) => handlePaperQuestionChange(question.questionId, (currentQuestion) => ({
                            ...currentQuestion,
                            options: ["A", "B", "C", "D"].map((key) => ({
                              key,
                              text: key === optionKey
                                ? e.target.value
                                : currentQuestion.options?.find((option) => option.key === key)?.text || "",
                            })),
                          }))}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    ))}

                    <div>
                      <label className="block text-sm font-medium mb-1">Correct Option</label>
                      <select
                        value={question.correctAnswer}
                        onChange={(e) => handlePaperQuestionChange(question.questionId, { correctAnswer: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="A">Option A</option>
                        <option value="B">Option B</option>
                        <option value="C">Option C</option>
                        <option value="D">Option D</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-1">Answer Sheet Value</label>
                    <input
                      type="text"
                      value={question.correctAnswer}
                      onChange={(e) => handlePaperQuestionChange(question.questionId, { correctAnswer: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowPaperModal(false); resetPaperForm(); }}
              className="px-4 py-2 border rounded-lg"
              disabled={paperSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#002366] text-white rounded-lg disabled:opacity-60"
              disabled={paperSaving}
            >
              {paperSaving ? "Saving..." : "Save Paper"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Exams;
