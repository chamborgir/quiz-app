import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import {
    listQuizzes,
    renameQuiz,
    deleteQuiz,
    listAttempts,
    assignQuizToCollection,
    listCollections,
    createCollection,
    renameCollection,
    deleteCollection,
    touchQuizAccess,
    getOrCreateShareCode,
    getOrCreateCollectionShareCode,
} from "../lib/quizApi.js";

const PAGE_SIZE = 10;

export default function Library({ setActiveQuiz }) {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [tab, setTab] = useState("all");
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

    const [collectionShareLinks, setCollectionShareLinks] = useState({});
    const [editingCollectionId, setEditingCollectionId] = useState(null);
    const [editCollectionValue, setEditCollectionValue] = useState("");
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'quiz' | 'group', id, label }
    const [newCollectionName, setNewCollectionName] = useState("");
    const [creatingCollection, setCreatingCollection] = useState(false);

    const [groupModalQuiz, setGroupModalQuiz] = useState(null);
    const [newGroupInline, setNewGroupInline] = useState("");
    const [creatingInlineGroup, setCreatingInlineGroup] = useState(false);

    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const menuRef = useRef(null);
    const searchWrapRef = useRef(null);

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
            if (
                searchOpen &&
                searchWrapRef.current &&
                !searchWrapRef.current.contains(e.target)
            ) {
                setSearchOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, [openMenuId, searchOpen]);

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
        touchQuizAccess(quiz.id);
        setActiveQuiz({
            mode: quiz.mode,
            questions: quiz.questions,
            quizId: quiz.id,
            title: quiz.title,
            recordAttempts: true,
            origin: "library",
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

    function requestDeleteQuiz(quiz) {
        setOpenMenuId(null);
        setDeleteTarget({ type: "quiz", id: quiz.id, label: quiz.title });
    }

    async function confirmDeleteQuiz(quizId) {
        await deleteQuiz(quizId);
        setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    }

    async function handleCopyShareLink(quiz) {
        setOpenMenuId(null);
        const code = await getOrCreateShareCode(quiz.id, quiz.share_code);
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

    function openCreateGroupModal() {
        setNewCollectionName("");
        setShowCreateGroupModal(true);
    }

    async function handleCreateCollection() {
        const name = newCollectionName.trim();
        if (!name) return;
        setCreatingCollection(true);
        try {
            const created = await createCollection(user.id, name);
            setCollections((prev) => [created, ...prev]);
            setNewCollectionName("");
            setShowCreateGroupModal(false);
        } catch (err) {
            alert("Failed to create group: " + err.message);
        } finally {
            setCreatingCollection(false);
        }
    }

    function startEditCollection(collection) {
        setEditingCollectionId(collection.id);
        setEditCollectionValue(collection.name);
    }

    async function saveEditCollection(collectionId) {
        const name = editCollectionValue.trim();
        if (name) {
            await renameCollection(collectionId, name);
            setCollections((prev) =>
                prev.map((c) => (c.id === collectionId ? { ...c, name } : c)),
            );
        }
        setEditingCollectionId(null);
    }

    function requestDeleteCollection(collection) {
        setDeleteTarget({
            type: "group",
            id: collection.id,
            label: collection.name,
        });
    }

    async function confirmDeleteCollection(collectionId) {
        await deleteCollection(collectionId);
        setCollections((prev) => prev.filter((c) => c.id !== collectionId));
        setQuizzes((prev) =>
            prev.map((q) =>
                q.collection_id === collectionId
                    ? { ...q, collection_id: null }
                    : q,
            ),
        );
        if (collectionFilter === collectionId) {
            setCollectionFilter(null);
            setTab("all");
        }
    }

    async function handleCopyGroupShareLink(collection) {
        const code = await getOrCreateCollectionShareCode(
            collection.id,
            collection.share_code,
        );
        const link = `${window.location.origin}/shared-group/${code}`;
        setCollectionShareLinks((prev) => ({ ...prev, [collection.id]: link }));
        setCollections((prev) =>
            prev.map((c) =>
                c.id === collection.id
                    ? { ...c, is_public: true, share_code: code }
                    : c,
            ),
        );
        await navigator.clipboard.writeText(link).catch(() => {});
    }
    async function handleConfirmDelete() {
        if (!deleteTarget) return;
        if (deleteTarget.type === "quiz") {
            await confirmDeleteQuiz(deleteTarget.id);
        } else {
            await confirmDeleteCollection(deleteTarget.id);
        }
        setDeleteTarget(null);
    }

    function cancelDelete() {
        setDeleteTarget(null);
    }

    function viewCollection(collectionId) {
        setCollectionFilter(collectionId);
        setTab("all");
        setPage(1);
    }

    function collectionName(id) {
        return collections.find((c) => c.id === id)?.name || null;
    }

    const searchLower = searchQuery.trim().toLowerCase();

    const filteredSorted = useMemo(() => {
        let list = [...quizzes];
        if (collectionFilter) {
            list = list.filter((q) => q.collection_id === collectionFilter);
        }
        if (searchLower) {
            list = list.filter((q) =>
                q.title.toLowerCase().includes(searchLower),
            );
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
        } else if (sortBy === "recent") {
            list.sort((a, b) => {
                const aTime = a.last_accessed_at
                    ? new Date(a.last_accessed_at).getTime()
                    : 0;
                const bTime = b.last_accessed_at
                    ? new Date(b.last_accessed_at).getTime()
                    : 0;
                return bTime - aTime;
            });
        }
        return list;
    }, [quizzes, sortBy, collectionFilter, searchLower]);

    const filteredGroups = useMemo(() => {
        if (!searchLower) return collections;
        return collections.filter((c) =>
            c.name.toLowerCase().includes(searchLower),
        );
    }, [collections, searchLower]);

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

    function closeSearch() {
        setSearchOpen(false);
    }

    return (
        <div className="page">
            <div className="library-top-row">
                <h2>My Library</h2>
                {!searchOpen && (
                    <button
                        className="search-icon-btn"
                        onClick={() => setSearchOpen(true)}
                        aria-label="Search library"
                    >
                        <Icon name="search" />
                    </button>
                )}
            </div>

            <div className="lib-tabs-wrap" ref={searchWrapRef}>
                {searchOpen ? (
                    <div className="search-bar-row">
                        <span className="search-bar-icon-fixed">
                            <Icon name="search" size={16} />
                        </span>
                        <input
                            autoFocus
                            type="text"
                            className="search-bar-input"
                            placeholder="Search quizzes or groups…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) =>
                                e.key === "Enter" && closeSearch()
                            }
                        />
                        <button
                            type="button"
                            className="search-enter-btn"
                            onClick={closeSearch}
                        >
                            Enter
                        </button>
                    </div>
                ) : (
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
                )}
            </div>

            {loading ? (
                <div className="library-loading">
                    <div className="spinner"></div>
                    <p className="muted">Loading your library…</p>
                </div>
            ) : (
                <>
                    {tab === "all" && (
                        <>
                            {collectionFilter && (
                                <div className="filter-banner">
                                    Showing:{" "}
                                    <strong>
                                        {collectionName(collectionFilter)}
                                    </strong>
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

                            <div className="sort-buttons-row">
                                <button
                                    className={`option-btn sort-btn ${sortBy === "date_desc" ? "active" : ""}`}
                                    onClick={() => changeSort("date_desc")}
                                >
                                    Newest
                                </button>
                                <button
                                    className={`option-btn sort-btn ${sortBy === "date_asc" ? "active" : ""}`}
                                    onClick={() => changeSort("date_asc")}
                                >
                                    Oldest
                                </button>
                                <button
                                    className={`option-btn sort-btn ${sortBy === "type" ? "active" : ""}`}
                                    onClick={() => changeSort("type")}
                                >
                                    Type
                                </button>
                                <button
                                    className={`option-btn sort-btn ${sortBy === "recent" ? "active" : ""}`}
                                    onClick={() => changeSort("recent")}
                                >
                                    Recent
                                </button>
                            </div>

                            {filteredSorted.length === 0 && (
                                <p className="muted">
                                    {searchLower
                                        ? "No quizzes match your search."
                                        : "No quizzes here yet."}
                                </p>
                            )}

                            {pagedQuizzes.map((quiz) => (
                                <div
                                    key={quiz.id}
                                    className="card library-item"
                                >
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
                                            <span
                                                className={`badge ${quiz.mode}`}
                                            >
                                                {quiz.mode === "mcq"
                                                    ? "MCQ"
                                                    : "Cards"}
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
                                                            openMenuId ===
                                                                quiz.id
                                                                ? null
                                                                : quiz.id,
                                                        )
                                                    }
                                                    aria-label="More options"
                                                >
                                                    <svg
                                                        width="18"
                                                        height="18"
                                                        viewBox="0 0 24 24"
                                                        fill="currentColor"
                                                        aria-hidden="true"
                                                    >
                                                        <circle
                                                            cx="12"
                                                            cy="5"
                                                            r="2"
                                                        />
                                                        <circle
                                                            cx="12"
                                                            cy="12"
                                                            r="2"
                                                        />
                                                        <circle
                                                            cx="12"
                                                            cy="19"
                                                            r="2"
                                                        />
                                                    </svg>
                                                </button>
                                                {openMenuId === quiz.id && (
                                                    <div className="quiz-menu">
                                                        <button
                                                            onClick={() => {
                                                                setOpenMenuId(
                                                                    null,
                                                                );
                                                                navigate(
                                                                    `/edit/${quiz.id}`,
                                                                );
                                                            }}
                                                        >
                                                            Edit Questions
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                startEdit(quiz)
                                                            }
                                                        >
                                                            Rename
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setOpenMenuId(
                                                                    null,
                                                                );
                                                                openGroupModal(
                                                                    quiz,
                                                                );
                                                            }}
                                                        >
                                                            {quiz.collection_id
                                                                ? "Change Group"
                                                                : "Add to Group"}
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                handleCopyShareLink(
                                                                    quiz,
                                                                )
                                                            }
                                                        >
                                                            Copy Share Link
                                                        </button>
                                                        <button
                                                            className="danger"
                                                            onClick={() =>
                                                                requestDeleteQuiz(
                                                                    quiz,
                                                                )
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
                                        {new Date(
                                            quiz.created_at,
                                        ).toLocaleDateString()}
                                        {quiz.last_accessed_at && (
                                            <>
                                                {" "}
                                                · Last taken{" "}
                                                {new Date(
                                                    quiz.last_accessed_at,
                                                ).toLocaleDateString()}
                                            </>
                                        )}
                                        {quiz.collection_id && (
                                            <>
                                                {" "}
                                                · Group:{" "}
                                                <strong>
                                                    {collectionName(
                                                        quiz.collection_id,
                                                    )}
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
                                                onClick={() =>
                                                    toggleHistory(quiz)
                                                }
                                            >
                                                {expandedId === quiz.id
                                                    ? "Hide history"
                                                    : "History"}
                                            </button>
                                        )}
                                    </div>

                                    {shareLinks[quiz.id] && (
                                        <div className="share-link-box">
                                            <input
                                                readOnly
                                                value={shareLinks[quiz.id]}
                                                onFocus={(e) =>
                                                    e.target.select()
                                                }
                                            />
                                            <span className="copied-tag">
                                                Link copied
                                            </span>
                                        </div>
                                    )}

                                    {expandedId === quiz.id && (
                                        <div className="attempt-history">
                                            {(attempts[quiz.id] || [])
                                                .length === 0 && (
                                                <p className="muted small">
                                                    No attempts yet.
                                                </p>
                                            )}
                                            {(attempts[quiz.id] || []).map(
                                                (a) => (
                                                    <div
                                                        key={a.id}
                                                        className="attempt-row"
                                                    >
                                                        <span>
                                                            {a.score} /{" "}
                                                            {a.total}
                                                        </span>
                                                        <span className="muted small">
                                                            {new Date(
                                                                a.attempted_at,
                                                            ).toLocaleString()}
                                                        </span>
                                                    </div>
                                                ),
                                            )}
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
                                            setPage((p) =>
                                                Math.min(totalPages, p + 1),
                                            )
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
                            <div
                                className="nav-row centered"
                                style={{ marginBottom: "1.25rem" }}
                            >
                                <button
                                    className="btn"
                                    onClick={openCreateGroupModal}
                                >
                                    + Create Group
                                </button>
                            </div>

                            {filteredGroups.length === 0 && (
                                <p className="muted">
                                    {searchLower
                                        ? "No groups match your search."
                                        : "No groups yet. Create one to start grouping your quizzes."}
                                </p>
                            )}

                            {filteredGroups.map((collection) => {
                                const quizCount = quizzes.filter(
                                    (q) => q.collection_id === collection.id,
                                ).length;
                                return (
                                    <div
                                        key={collection.id}
                                        className="card library-item"
                                    >
                                        <div className="library-header">
                                            {editingCollectionId ===
                                            collection.id ? (
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
                                                        saveEditCollection(
                                                            collection.id,
                                                        )
                                                    }
                                                    onBlur={() =>
                                                        saveEditCollection(
                                                            collection.id,
                                                        )
                                                    }
                                                    autoFocus
                                                />
                                            ) : (
                                                <h3>{collection.name}</h3>
                                            )}
                                            <span className="badge">
                                                {quizCount} quiz
                                                {quizCount === 1 ? "" : "zes"}
                                            </span>
                                        </div>

                                        <div className="group-actions-row">
                                            <button
                                                className="btn-sm"
                                                onClick={() =>
                                                    viewCollection(
                                                        collection.id,
                                                    )
                                                }
                                            >
                                                View
                                            </button>
                                            {editingCollectionId ===
                                            collection.id ? (
                                                <button
                                                    className="btn-text"
                                                    onClick={() =>
                                                        saveEditCollection(
                                                            collection.id,
                                                        )
                                                    }
                                                >
                                                    Save
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn-text"
                                                    onClick={() =>
                                                        startEditCollection(
                                                            collection,
                                                        )
                                                    }
                                                >
                                                    Rename
                                                </button>
                                            )}
                                            <button
                                                className="btn-text"
                                                onClick={() =>
                                                    handleCopyGroupShareLink(
                                                        collection,
                                                    )
                                                }
                                            >
                                                Share
                                            </button>
                                            <button
                                                className="btn-text danger"
                                                onClick={() =>
                                                    requestDeleteCollection(
                                                        collection,
                                                    )
                                                }
                                            >
                                                Delete
                                            </button>
                                        </div>

                                        {collectionShareLinks[
                                            collection.id
                                        ] && (
                                            <div className="share-link-box">
                                                <input
                                                    readOnly
                                                    value={
                                                        collectionShareLinks[
                                                            collection.id
                                                        ]
                                                    }
                                                    onFocus={(e) =>
                                                        e.target.select()
                                                    }
                                                />
                                                <span className="copied-tag">
                                                    Link copied
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </>
            )}

            {showCreateGroupModal && (
                <div
                    className="modal-overlay"
                    onClick={() => setShowCreateGroupModal(false)}
                >
                    <div
                        className="modal-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="modal-close"
                            onClick={() => setShowCreateGroupModal(false)}
                            aria-label="Close"
                        >
                            ×
                        </button>
                        <h3>Create New Group</h3>
                        <div className="field" style={{ marginBottom: "1rem" }}>
                            <label>Group Name</label>
                            <input
                                autoFocus
                                value={newCollectionName}
                                onChange={(e) =>
                                    setNewCollectionName(e.target.value)
                                }
                                onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    handleCreateCollection()
                                }
                                placeholder="e.g. Midterm Review"
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
                                    : "Create Group"}
                            </button>
                        </div>
                    </div>
                </div>
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

            {deleteTarget && (
                <div className="modal-overlay" onClick={cancelDelete}>
                    <div
                        className="modal-card result-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="modal-close"
                            onClick={cancelDelete}
                            aria-label="Close"
                        >
                            ×
                        </button>
                        <Icon
                            name="trash"
                            size={36}
                            className="result-emoji-icon"
                        />
                        <p className="warning-title">
                            Delete "{deleteTarget.label}"?
                        </p>
                        <p
                            className="muted"
                            style={{ marginBottom: "1.25rem" }}
                        >
                            {deleteTarget.type === "quiz"
                                ? "This will permanently delete the quiz. This cannot be undone."
                                : "This will delete the group. Quizzes inside it will not be deleted, just un-grouped."}
                        </p>
                        <div className="nav-row centered">
                            <button
                                className="btn btn-secondary"
                                onClick={cancelDelete}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-delete-confirm"
                                onClick={handleConfirmDelete}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
