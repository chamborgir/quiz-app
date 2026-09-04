import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
    listQuizzes,
    renameQuiz,
    deleteQuiz,
    shareQuiz,
    unshareQuiz,
    listAttempts,
    assignQuizToCollection,
    listCollections,
    createCollection,
    renameCollection,
    deleteCollection,
} from "../lib/quizApi.js";

const PAGE_SIZE = 10;

export default function Library({ setActiveQuiz }) {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [tab, setTab] = useState("all"); // all | groups
    const [quizzes, setQuizzes] = useState([]);
    const [collections, setCollections] = useState([]);
    const [loading, setLoading] = useState(true);

    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [expandedId, setExpandedId] = useState(null);
    const [attempts, setAttempts] = useState({});
    const [shareLinks, setShareLinks] = useState({});
    const [openMenuId, setOpenMenuId] = useState(null);

    const [sortBy, setSortBy] = useState("date_desc");
    const [page, setPage] = useState(1);
    const [collectionFilter, setCollectionFilter] = useState(null);

    const [newCollectionName, setNewCollectionName] = useState("");
    const [creatingCollection, setCreatingCollection] = useState(false);
    const [editingCollectionId, setEditingCollectionId] = useState(null);
    const [editCollectionValue, setEditCollectionValue] = useState("");

    // Add-to-group modal
    const [groupModalQuiz, setGroupModalQuiz] = useState(null); // the quiz object, or null if closed
    const [newGroupInline, setNewGroupInline] = useState("");
    const [creatingInlineGroup, setCreatingInlineGroup] = useState(false);

    const menuRef = useRef(null);

    useEffect(() => {
        load();
    }, []);

    useEffect(() => {
        function handleClickOutside(e) {
            if (
                openMenuId &&
                menuRef.current &&
                !menuRef.current.contains(e.target)
            ) {
                setOpenMenuId(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, [openMenuId]);

    async function load() {
        setLoading(true);
        try {
            const [q, c] = await Promise.all([
                listQuizzes(user.id),
                listCollections(user.id),
            ]);
            setQuizzes(q);
            setCollections(c);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    function startPlay(quiz) {
        setActiveQuiz({
            mode: quiz.mode,
            questions: quiz.questions,
            quizId: quiz.id,
            title: quiz.title,
            recordAttempts: true,
        });
        navigate("/play");
    }

    function startEdit(quiz) {
        setEditingId(quiz.id);
        setEditValue(quiz.title);
        setOpenMenuId(null);
    }

    async function saveEdit(quizId) {
        const title = editValue.trim();
        if (title) {
            await renameQuiz(quizId, title);
            setQuizzes((prev) =>
                prev.map((q) => (q.id === quizId ? { ...q, title } : q)),
            );
        }
        setEditingId(null);
    }

    async function handleDelete(quizId) {
        setOpenMenuId(null);
        if (!confirm("Delete this quiz permanently?")) return;
        await deleteQuiz(quizId);
        setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    }

    async function handleShare(quiz) {
        setOpenMenuId(null);
        const code = await shareQuiz(quiz.id, quiz.share_code);
        const link = `${window.location.origin}/shared/${code}`;
        setShareLinks((prev) => ({ ...prev, [quiz.id]: link }));
        setQuizzes((prev) =>
            prev.map((q) =>
                q.id === quiz.id
                    ? { ...q, is_public: true, share_code: code }
                    : q,
            ),
        );
        await navigator.clipboard.writeText(link).catch(() => {});
    }

    async function handleUnshare(quiz) {
        setOpenMenuId(null);
        await unshareQuiz(quiz.id);
        setQuizzes((prev) =>
            prev.map((q) =>
                q.id === quiz.id ? { ...q, is_public: false } : q,
            ),
        );
        setShareLinks((prev) => ({ ...prev, [quiz.id]: "" }));
    }

    async function toggleHistory(quiz) {
        if (expandedId === quiz.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(quiz.id);
        if (!attempts[quiz.id]) {
            const data = await listAttempts(quiz.id);
            setAttempts((prev) => ({ ...prev, [quiz.id]: data }));
        }
    }

    function openGroupModal(quiz) {
        setGroupModalQuiz(quiz);
        setNewGroupInline("");
    }

    function closeGroupModal() {
        setGroupModalQuiz(null);
        setNewGroupInline("");
    }

    async function handleSelectGroup(collectionId) {
        if (!groupModalQuiz) return;
        await assignQuizToCollection(groupModalQuiz.id, collectionId);
        setQuizzes((prev) =>
            prev.map((q) =>
                q.id === groupModalQuiz.id
                    ? { ...q, collection_id: collectionId }
                    : q,
            ),
        );
        closeGroupModal();
    }

    async function handleCreateAndAssignGroup() {
        const name = newGroupInline.trim();
        if (!name || !groupModalQuiz) return;
        setCreatingInlineGroup(true);
        try {
            const created = await createCollection(user.id, name);
            setCollections((prev) => [created, ...prev]);
            await assignQuizToCollection(groupModalQuiz.id, created.id);
            setQuizzes((prev) =>
                prev.map((q) =>
                    q.id === groupModalQuiz.id
                        ? { ...q, collection_id: created.id }
                        : q,
                ),
            );
            closeGroupModal();
        } catch (err) {
            alert("Failed to create group: " + err.message);
        } finally {
            setCreatingInlineGroup(false);
        }
    }

    async function handleCreateCollection() {
        const name = newCollectionName.trim();
        if (!name) return;
        setCreatingCollection(true);
        try {
            const created = await createCollection(user.id, name);
            setCollections((prev) => [created, ...prev]);
            setNewCollectionName("");
        } catch (err) {
            alert("Failed to create group: " + err.message);
        } finally {
            setCreatingCollection(false);
        }
    }

    function startEditCollection(col) {
        setEditingCollectionId(col.id);
        setEditCollectionValue(col.name);
    }

    async function saveEditCollection(colId) {
        const name = editCollectionValue.trim();
        if (name) {
            await renameCollection(colId, name);
            setCollections((prev) =>
                prev.map((c) => (c.id === colId ? { ...c, name } : c)),
            );
        }
        setEditingCollectionId(null);
    }

    async function handleDeleteCollection(colId) {
        if (
            !confirm(
                "Delete this group? Quizzes inside it will not be deleted, just un-grouped.",
            )
        )
            return;
        await deleteCollection(colId);
        setCollections((prev) => prev.filter((c) => c.id !== colId));
        setQuizzes((prev) =>
            prev.map((q) =>
                q.collection_id === colId ? { ...q, collection_id: null } : q,
            ),
        );
        if (collectionFilter === colId) {
            setCollectionFilter(null);
            setTab("all");
        }
    }

    function viewCollection(colId) {
        setCollectionFilter(colId);
        setTab("all");
        setPage(1);
    }

    function collectionName(id) {
        return collections.find((c) => c.id === id)?.name || null;
    }

    const filteredSorted = useMemo(() => {
        let list = [...quizzes];
        if (collectionFilter) {
            list = list.filter((q) => q.collection_id === collectionFilter);
        }
        if (sortBy === "date_desc") {
            list.sort(
                (a, b) => new Date(b.created_at) - new Date(a.created_at),
            );
        } else if (sortBy === "date_asc") {
            list.sort(
                (a, b) => new Date(a.created_at) - new Date(b.created_at),
            );
        } else if (sortBy === "type") {
            list.sort(
                (a, b) =>
                    a.mode.localeCompare(b.mode) ||
                    new Date(b.created_at) - new Date(a.created_at),
            );
        }
        return list;
    }, [quizzes, sortBy, collectionFilter]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredSorted.length / PAGE_SIZE),
    );
    const pagedQuizzes = filteredSorted.slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE,
    );

    function changeSort(value) {
        setSortBy(value);
        setPage(1);
    }

    if (loading)
        return <div className="page-loading">Loading your library…</div>;

    return (
        <div className="page">
            <h2>My Library</h2>

            <div className="lib-tabs">
                <button
                    className={`lib-tab ${tab === "all" ? "active" : ""}`}
                    onClick={() => {
                        setTab("all");
                        setCollectionFilter(null);
                        setPage(1);
                    }}
                >
                    All Quizzes
                </button>
                <button
                    className={`lib-tab ${tab === "groups" ? "active" : ""}`}
                    onClick={() => setTab("groups")}
                >
                    Groups
                </button>
            </div>

            {tab === "all" && (
                <>
                    {collectionFilter && (
                        <div className="filter-banner">
                            Showing:{" "}
                            <strong>{collectionName(collectionFilter)}</strong>
                            <button
                                className="btn-text"
                                onClick={() => {
                                    setCollectionFilter(null);
                                    setPage(1);
                                }}
                            >
                                Clear filter
                            </button>
                        </div>
                    )}

                    <div className="sort-row">
                        <span className="muted small">Sort by:</span>
                        <div className="option-row centered">
                            <button
                                className={`option-btn ${sortBy === "date_desc" ? "active" : ""}`}
                                onClick={() => changeSort("date_desc")}
                            >
                                Newest
                            </button>
                            <button
                                className={`option-btn ${sortBy === "date_asc" ? "active" : ""}`}
                                onClick={() => changeSort("date_asc")}
                            >
                                Oldest
                            </button>
                            <button
                                className={`option-btn ${sortBy === "type" ? "active" : ""}`}
                                onClick={() => changeSort("type")}
                            >
                                Type
                            </button>
                        </div>
                    </div>

                    {filteredSorted.length === 0 && (
                        <p className="muted">No quizzes here yet.</p>
                    )}

                    {pagedQuizzes.map((quiz) => (
                        <div key={quiz.id} className="card library-item">
                            <div className="library-header">
                                {editingId === quiz.id ? (
                                    <input
                                        className="inline-input"
                                        value={editValue}
                                        onChange={(e) =>
                                            setEditValue(e.target.value)
                                        }
                                        onKeyDown={(e) =>
                                            e.key === "Enter" &&
                                            saveEdit(quiz.id)
                                        }
                                        onBlur={() => saveEdit(quiz.id)}
                                        autoFocus
                                    />
                                ) : (
                                    <h3>{quiz.title}</h3>
                                )}

                                <div className="header-right">
                                    <span className={`badge ${quiz.mode}`}>
                                        {quiz.mode === "mcq" ? "MCQ" : "Cards"}
                                    </span>

                                    <div
                                        className="quiz-menu-wrap"
                                        ref={
                                            openMenuId === quiz.id
                                                ? menuRef
                                                : null
                                        }
                                    >
                                        <button
                                            className="menu-trigger"
                                            onClick={() =>
                                                setOpenMenuId(
                                                    openMenuId === quiz.id
                                                        ? null
                                                        : quiz.id,
                                                )
                                            }
                                            aria-label="More options"
                                        >
                                            ⋮
                                        </button>
                                        {openMenuId === quiz.id && (
                                            <div className="quiz-menu">
                                                <button
                                                    onClick={() =>
                                                        startEdit(quiz)
                                                    }
                                                >
                                                    Rename
                                                </button>
                                                {quiz.is_public ? (
                                                    <button
                                                        onClick={() =>
                                                            handleUnshare(quiz)
                                                        }
                                                    >
                                                        Unshare
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() =>
                                                            handleShare(quiz)
                                                        }
                                                    >
                                                        Share
                                                    </button>
                                                )}
                                                <button
                                                    className="danger"
                                                    onClick={() =>
                                                        handleDelete(quiz.id)
                                                    }
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <p className="muted small">
                                {quiz.count} items ·{" "}
                                {new Date(quiz.created_at).toLocaleDateString()}
                                {quiz.collection_id && (
                                    <>
                                        {" "}
                                        · Group:{" "}
                                        <strong>
                                            {collectionName(quiz.collection_id)}
                                        </strong>
                                    </>
                                )}
                            </p>

                            <div className="library-actions">
                                <button
                                    className="btn btn-sm"
                                    onClick={() => startPlay(quiz)}
                                >
                                    Take Quiz
                                </button>
                                {quiz.mode === "mcq" && (
                                    <button
                                        className="btn-text"
                                        onClick={() => toggleHistory(quiz)}
                                    >
                                        {expandedId === quiz.id
                                            ? "Hide history"
                                            : "History"}
                                    </button>
                                )}
                                <button
                                    className="btn-text"
                                    onClick={() => openGroupModal(quiz)}
                                >
                                    {quiz.collection_id
                                        ? "Change Group"
                                        : "Add to Group"}
                                </button>
                            </div>

                            {shareLinks[quiz.id] && (
                                <div className="share-link-box">
                                    <input
                                        readOnly
                                        value={shareLinks[quiz.id]}
                                        onFocus={(e) => e.target.select()}
                                    />
                                    <span className="copied-tag">
                                        Link copied
                                    </span>
                                </div>
                            )}

                            {expandedId === quiz.id && (
                                <div className="attempt-history">
                                    {(attempts[quiz.id] || []).length === 0 && (
                                        <p className="muted small">
                                            No attempts yet.
                                        </p>
                                    )}
                                    {(attempts[quiz.id] || []).map((a) => (
                                        <div key={a.id} className="attempt-row">
                                            <span>
                                                {a.score} / {a.total}
                                            </span>
                                            <span className="muted small">
                                                {new Date(
                                                    a.attempted_at,
                                                ).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {totalPages > 1 && (
                        <div className="pagination-row">
                            <button
                                className="btn-text"
                                onClick={() =>
                                    setPage((p) => Math.max(1, p - 1))
                                }
                                disabled={page === 1}
                            >
                                ← Prev
                            </button>
                            {Array.from(
                                { length: totalPages },
                                (_, i) => i + 1,
                            ).map((p) => (
                                <button
                                    key={p}
                                    className={`page-num ${p === page ? "active" : ""}`}
                                    onClick={() => setPage(p)}
                                >
                                    {p}
                                </button>
                            ))}
                            <button
                                className="btn-text"
                                onClick={() =>
                                    setPage((p) => Math.min(totalPages, p + 1))
                                }
                                disabled={page === totalPages}
                            >
                                Next →
                            </button>
                        </div>
                    )}
                </>
            )}

            {tab === "groups" && (
                <>
                    <div className="card">
                        <div
                            className="field"
                            style={{ marginBottom: "0.75rem" }}
                        >
                            <label>New Group Name</label>
                            <input
                                value={newCollectionName}
                                onChange={(e) =>
                                    setNewCollectionName(e.target.value)
                                }
                                onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    handleCreateCollection()
                                }
                                placeholder="e.g. ProfEd Review"
                            />
                        </div>
                        <div className="nav-row centered">
                            <button
                                className="btn"
                                onClick={handleCreateCollection}
                                disabled={
                                    creatingCollection ||
                                    !newCollectionName.trim()
                                }
                            >
                                {creatingCollection
                                    ? "Creating…"
                                    : "+ Create Group"}
                            </button>
                        </div>
                    </div>

                    {collections.length === 0 && (
                        <p className="muted">
                            No groups yet. Create one above to start grouping
                            your quizzes.
                        </p>
                    )}

                    {collections.map((col) => {
                        const quizCount = quizzes.filter(
                            (q) => q.collection_id === col.id,
                        ).length;
                        return (
                            <div key={col.id} className="card library-item">
                                <div className="library-header">
                                    {editingCollectionId === col.id ? (
                                        <input
                                            className="inline-input"
                                            value={editCollectionValue}
                                            onChange={(e) =>
                                                setEditCollectionValue(
                                                    e.target.value,
                                                )
                                            }
                                            onKeyDown={(e) =>
                                                e.key === "Enter" &&
                                                saveEditCollection(col.id)
                                            }
                                            onBlur={() =>
                                                saveEditCollection(col.id)
                                            }
                                            autoFocus
                                        />
                                    ) : (
                                        <h3>{col.name}</h3>
                                    )}
                                    <span className="badge">
                                        {quizCount} quiz
                                        {quizCount === 1 ? "" : "zes"}
                                    </span>
                                </div>
                                <div className="library-actions">
                                    <button
                                        className="btn btn-sm"
                                        onClick={() => viewCollection(col.id)}
                                    >
                                        View Quizzes
                                    </button>
                                    {editingCollectionId === col.id ? (
                                        <button
                                            className="btn-text"
                                            onClick={() =>
                                                saveEditCollection(col.id)
                                            }
                                        >
                                            Save name
                                        </button>
                                    ) : (
                                        <button
                                            className="btn-text"
                                            onClick={() =>
                                                startEditCollection(col)
                                            }
                                        >
                                            Rename
                                        </button>
                                    )}
                                    <button
                                        className="btn-text danger"
                                        onClick={() =>
                                            handleDeleteCollection(col.id)
                                        }
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </>
            )}

            {groupModalQuiz && (
                <div className="modal-overlay" onClick={closeGroupModal}>
                    <div
                        className="modal-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="modal-close"
                            onClick={closeGroupModal}
                            aria-label="Close"
                        >
                            ×
                        </button>
                        <h3>Add "{groupModalQuiz.title}" to a Group</h3>

                        <div className="group-option-list">
                            <button
                                className={`group-option ${!groupModalQuiz.collection_id ? "active" : ""}`}
                                onClick={() => handleSelectGroup(null)}
                            >
                                No Group
                            </button>
                            {collections.map((c) => (
                                <button
                                    key={c.id}
                                    className={`group-option ${groupModalQuiz.collection_id === c.id ? "active" : ""}`}
                                    onClick={() => handleSelectGroup(c.id)}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>

                        <div className="group-modal-divider">
                            <span>or create a new group</span>
                        </div>

                        <div
                            className="field"
                            style={{ marginBottom: "0.75rem" }}
                        >
                            <input
                                value={newGroupInline}
                                onChange={(e) =>
                                    setNewGroupInline(e.target.value)
                                }
                                onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    handleCreateAndAssignGroup()
                                }
                                placeholder="New group name"
                            />
                        </div>
                        <button
                            className="btn btn-block"
                            onClick={handleCreateAndAssignGroup}
                            disabled={
                                creatingInlineGroup || !newGroupInline.trim()
                            }
                        >
                            {creatingInlineGroup
                                ? "Creating…"
                                : "+ Create & Add"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
