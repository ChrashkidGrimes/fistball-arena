// Custom, exclusive line-icon set for Fistball Arena. One cohesive family:
// 24-viewBox, currentColor stroke, round caps/joins. No emoji, no icon library.

function Svg({ size = 20, sw = 1.7, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

// Global
export const IconEvents = (p) => (
  <Svg {...p}><rect x="3.5" y="8.5" width="13" height="11.5" rx="2.2" />
    <path d="M8 8.5V6.2A2.2 2.2 0 0 1 10.2 4h8.6A2.2 2.2 0 0 1 21 6.2v9.6a2.2 2.2 0 0 1-2.2 2.2H16.5" />
    <path d="M7 13.5h6M7 16.5h4" /></Svg>
);
export const IconUsers = (p) => (
  <Svg {...p}><circle cx="9" cy="8.5" r="3" /><path d="M3.6 19.4a5.5 5.5 0 0 1 10.8 0" />
    <circle cx="17.6" cy="10" r="2.1" /><path d="M17.6 12.1v4.5M17.6 15.2h1.5" /></Svg>
);
export const IconGuide = (p) => (
  <Svg {...p}><path d="M12 6.6C10 5.1 7.2 4.6 4.6 5.3v12.5C7.2 17.1 10 17.6 12 19.1" />
    <path d="M12 6.6C14 5.1 16.8 4.6 19.4 5.3v12.5C16.8 17.1 14 17.6 12 19.1" /><path d="M12 6.6v12.5" /></Svg>
);

// Event
export const IconGames = (p) => (
  <Svg {...p}><circle cx="15" cy="8" r="3.4" /><path d="M4 20h16" /><path d="M5.6 16c2-2.1 4.4-3.1 6.9-2.7" /></Svg>
);
export const IconStandings = (p) => (
  <Svg {...p}><path d="M4 20h16" /><path d="M6.5 20v-4.5M12 20V8.5M17.5 20v-7" /></Svg>
);
export const IconBracket = (p) => (
  <Svg {...p}><path d="M4 7h3v5h4" /><path d="M4 17h3v-5" /><path d="M11 12h5.5" /><circle cx="19" cy="12" r="1.4" /></Svg>
);
export const IconSchedule = (p) => (
  <Svg {...p}><rect x="4" y="5" width="16" height="15" rx="2.4" /><path d="M4 9.5h16M8.5 5V3M15.5 5V3" />
    <path d="M8 13h2M14 13h2M8 16.5h2" /></Svg>
);
export const IconRoster = (p) => (
  <Svg {...p} sw={1.6}><path d="M9 4.4 5.4 6.6 4 10.2l2.6 1.5L8 10.2V20h8v-9.8l1.4 1.5L20 10.2 18.6 6.6 15 4.4a3 3 0 0 1-6 0Z" /></Svg>
);
export const IconSettings = (p) => (
  <Svg {...p}><path d="M4 8h8.5M17 8h3" /><circle cx="14.7" cy="8" r="2.2" />
    <path d="M4 16h3.3M11.7 16H20" /><circle cx="9.3" cy="16" r="2.2" /></Svg>
);

// Roles
export const IconEye = (p) => (
  <Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" /></Svg>
);
export const IconWhistle = (p) => (
  <Svg {...p}><path d="M3 11.5A4.5 4.5 0 0 1 7.5 7H20a1 1 0 0 1 1 1v1.2a5.8 5.8 0 1 1-9.9 4.05" /><circle cx="7.2" cy="12.2" r="3" /><path d="M12.5 7V4.6h4" /></Svg>
);
export const IconShield = (p) => (
  <Svg {...p}><path d="M12 3.5 5.5 6v5.2c0 4 2.8 6.9 6.5 8.3 3.7-1.4 6.5-4.3 6.5-8.3V6L12 3.5Z" /><path d="M9.2 12l2 2 3.6-4" /></Svg>
);
export const IconStar = (p) => (
  <Svg {...p}><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.25.9-5.23-3.8-3.7 5.25-.76L12 4Z" /></Svg>
);
export const IconEdit = (p) => (
  <Svg {...p}><path d="M4 20h4l10-10-4-4L4 16v4Z" /><path d="M13.5 6.5l4 4" /></Svg>
);

export const IconClipboard = (p) => (
  <Svg {...p}><rect x="5" y="4.5" width="14" height="16" rx="2.4" /><path d="M9 4.5V3.5h6v1M8.5 10h7M8.5 13.5h7M8.5 17h4.5" /></Svg>
);
export const IconShirt = (p) => (
  <Svg {...p}><path d="M8.5 3.5 5 6 3.2 9l2.3 1.6L7 9.4V20h10V9.4l1.5 1.2L20.8 9 19 6l-3.5-2.5a3.5 3.5 0 0 1-7 0Z" /></Svg>
);

// Utility
export const IconBack = (p) => (
  <Svg {...p} sw={2}><path d="M14 6l-6 6 6 6" /></Svg>
);
export const IconSignOut = (p) => (
  <Svg {...p}><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20H15" />
    <path d="M10 12h9M16 8l4 4-4 4" /></Svg>
);
