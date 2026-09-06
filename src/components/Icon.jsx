const paths = {
    search: (
        <path d="M11 4a7 7 0 105.196 11.696l4.554 4.554a1 1 0 001.414-1.414l-4.554-4.554A7 7 0 0011 4zm-5 7a5 5 0 1110 0 5 5 0 01-10 0z" />
    ),
    close: (
        <path d="M6.293 4.879a1 1 0 00-1.414 1.414L10.586 12l-5.707 5.707a1 1 0 101.414 1.414L12 13.414l5.707 5.707a1 1 0 001.414-1.414L13.414 12l5.707-5.707a1 1 0 00-1.414-1.414L12 10.586 6.293 4.879z" />
    ),
    moon: (
        <path d="M20.354 15.354A9 9 0 018.646 3.646a9.003 9.003 0 1011.708 11.708z" />
    ),
    sun: (
        <path
            d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.657-6.657l1.414-1.414M4.929 19.071l1.414-1.414M18.071 18.071l1.414 1.414M4.929 4.929L6.343 6.343M12 8a4 4 0 100 8 4 4 0 000-8z"
            fill="none"
            strokeWidth="1.6"
            stroke="currentColor"
            strokeLinecap="round"
        />
    ),
    book: (
        <path d="M4 5.5A2.5 2.5 0 016.5 3H19a1 1 0 011 1v15a1 1 0 01-1 1H6.5A2.5 2.5 0 004 17.5v-12zm2.5-.5a.5.5 0 00-.5.5V16.05a2.5 2.5 0 011-.05H18V5H6.5z" />
    ),
    menu: (
        <path d="M4 6h16a1 1 0 010 2H4a1 1 0 010-2zm0 5h16a1 1 0 010 2H4a1 1 0 010-2zm0 5h16a1 1 0 010 2H4a1 1 0 010-2z" />
    ),
    trash: (
        <path d="M9 3a1 1 0 00-1 1v1H4.5a1 1 0 000 2H5v12a2 2 0 002 2h10a2 2 0 002-2V7h.5a1 1 0 000-2H16V4a1 1 0 00-1-1H9zm1 2h4v0h-4V5zM7 7h10v12H7V7zm3 2a1 1 0 00-1 1v6a1 1 0 002 0v-6a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v6a1 1 0 002 0v-6a1 1 0 00-1-1z" />
    ),
    flag: (
        <path d="M6 3a1 1 0 011-1h.01A1 1 0 018 3v18a1 1 0 01-2 0V3zm2 1v9c2-1 4-1 6 0s4 1 6 0V4c-2 1-4 1-6 0s-4-1-6 0z" />
    ),
    warning: (
        <path d="M12 2a1 1 0 01.894.553l9 18A1 1 0 0121 22H3a1 1 0 01-.894-1.447l9-18A1 1 0 0112 2zm0 7a1 1 0 00-1 1v4a1 1 0 002 0v-4a1 1 0 00-1-1zm0 8a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" />
    ),
    celebrate: (
        <path
            d="M3 21l2.5-8.5L14 4l6 6-8.5 8.5L3 21zm12.5-15.5L17 4l3 3-1.5 1.5-3-3zM8 13l3 3"
            fill="none"
            strokeWidth="1.6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    ),
    effort: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
    clipboard: (
        <path d="M9 2a1 1 0 00-1 1v1H6a2 2 0 00-2 2v13a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2V3a1 1 0 00-1-1H9zm1 2h4v2h-4V4zM6 6h2v1a1 1 0 001 1h6a1 1 0 001-1V6h2v13H6V6z" />
    ),
    chevronDown: (
        <path d="M6.293 8.293a1 1 0 011.414 0L12 12.586l4.293-4.293a1 1 0 111.414 1.414l-5 5a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414z" />
    ),
    upload: (
        <path d="M12 3a1 1 0 01.707.293l5 5a1 1 0 01-1.414 1.414L13 6.414V15a1 1 0 01-2 0V6.414l-3.293 3.293a1 1 0 01-1.414-1.414l5-5A1 1 0 0112 3zM5 19a1 1 0 011-1h12a1 1 0 010 2H6a1 1 0 01-1-1z" />
    ),
};

export default function Icon({ name, size = 18, className = "", color }) {
    const path = paths[name];
    if (!path) return null;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={color || "currentColor"}
            className={`icon ${className}`}
            aria-hidden="true"
            style={color ? undefined : { color: "inherit" }}
        >
            {path}
        </svg>
    );
}
