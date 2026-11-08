import type { SVGProps } from "react"

export type IconName = "activity" | "arrow-left" | "arrow-right" | "bell" | "book" | "calendar" | "camera" | "chart" | "check" | "chevron-down" | "chevron-right" | "clock" | "close" | "dumbbell" | "edit" | "eye" | "eye-off" | "flame" | "footprints" | "google" | "heart" | "home" | "image" | "info" | "leaf" | "lock" | "logout" | "mail" | "menu" | "minus" | "moon" | "more" | "pause" | "play" | "plus" | "refresh" | "scan" | "search" | "settings" | "shield" | "sparkles" | "sun" | "target" | "timer" | "trash" | "user" | "water" | "weight"

type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName
  size?: number
  title?: string
}

export default function Icon({ name, size = 20, title, ...props }: IconProps) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  }

  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {name === "home" && (
        <>
          <path d="m3 10 9-7 9 7" {...common} />
          <path d="M5 9.5V21h14V9.5M9 21v-7h6v7" {...common} />
        </>
      )}
      {name === "book" && (
        <>
          <path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z"
            {...common}
          />
          <path
            d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22V5.5Z"
            {...common}
          />
        </>
      )}
      {name === "dumbbell" && (
        <>
          <path d="M6 7v10M3.5 9v6M18 7v10M20.5 9v6M6 12h12" {...common} />
          <path d="M8 5v14M16 5v14" {...common} />
        </>
      )}
      {name === "chart" && (
        <>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...common} />
          <path d="m4 7 6-4 6 5 5-5" {...common} />
        </>
      )}
      {name === "scan" && (
        <>
          <path
            d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3M7 12h10"
            {...common}
          />
        </>
      )}
      {name === "user" && (
        <>
          <circle cx="12" cy="8" r="4" {...common} />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" {...common} />
        </>
      )}
      {name === "settings" && (
        <>
          <circle cx="12" cy="12" r="3" {...common} />
          <path
            d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.96 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.53-1H3v-4h.08A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.88L4.2 7.02 7.03 4.2l.06.06A1.7 1.7 0 0 0 8.96 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.03 1.53 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.6.64 1.03 1.25 1.03H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"
            {...common}
          />
        </>
      )}
      {name === "camera" && (
        <>
          <path
            d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4.5Z"
            {...common}
          />
          <circle cx="12" cy="12.5" r="4" {...common} />
        </>
      )}
      {name === "image" && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" {...common} />
          <circle cx="8.5" cy="9" r="1.5" {...common} />
          <path d="m4 17 5-5 3 3 2-2 6 5" {...common} />
        </>
      )}
      {name === "flame" && (
        <path
          d="M13.4 2.5c.3 3.2-1.5 4.8-2.9 6.2-1.2 1.2-2.3 2.4-2.3 4.7a5.8 5.8 0 0 0 11.6 0c0-2.3-1.1-4.6-3-6.7-.1 2-1 3.3-2 4.1.2-3.3-1-5.8-1.4-8.3Z"
          {...common}
        />
      )}
      {name === "footprints" && (
        <>
          <path
            d="M9.5 4.5C8.6 4.5 8 5.8 8 7.4c0 1.7.5 2.9 1.1 2.9.8 0 1.8-1.3 1.8-3S10.2 4.5 9.5 4.5ZM5.2 11c-1 0-1.7 1.5-1.7 3.4 0 1.8.5 3 1.3 3 1 0 1.9-1.4 1.9-3.3S6.1 11 5.2 11ZM17.1 13.2c-.6 0-1.1 1.2-1.1 2.8s.6 2.9 1.2 2.9 1.7-1.3 1.7-2.9-1.2-2.8-1.8-2.8ZM14.5 5.3c-.7 0-1.1 1.2-1.1 2.7 0 1.6.5 2.8 1.1 2.8.7 0 1.8-1.3 1.8-2.9 0-1.5-1-2.6-1.8-2.6Z"
            fill="currentColor"
            stroke="none"
          />
        </>
      )}
      {name === "water" && (
        <path
          d="M12 2.5S5.5 9.7 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 9.7 12 2.5 12 2.5Z"
          {...common}
        />
      )}
      {name === "arrow-left" && (
        <>
          <path d="m15 18-6-6 6-6" {...common} />
          <path d="M9 12h11" {...common} />
        </>
      )}
      {name === "arrow-right" && (
        <>
          <path d="m9 18 6-6-6-6" {...common} />
          <path d="M4 12h11" {...common} />
        </>
      )}
      {name === "chevron-right" && <path d="m9 18 6-6-6-6" {...common} />}
      {name === "chevron-down" && <path d="m6 9 6 6 6-6" {...common} />}
      {name === "plus" && (
        <>
          <path d="M12 5v14M5 12h14" {...common} />
        </>
      )}
      {name === "minus" && <path d="M5 12h14" {...common} />}
      {name === "check" && <path d="m5 12 4 4L19 6" {...common} />}
      {name === "close" && (
        <>
          <path d="m6 6 12 12M18 6 6 18" {...common} />
        </>
      )}
      {name === "mail" && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" {...common} />
          <path d="m4 7 8 6 8-6" {...common} />
        </>
      )}
      {name === "lock" && (
        <>
          <rect x="5" y="10" width="14" height="11" rx="2" {...common} />
          <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" {...common} />
        </>
      )}
      {name === "google" && (
        <>
          <path
            d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.7 4.7 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.3Z"
            fill="#4285F4"
            stroke="none"
          />
          <path
            d="M12 22c2.7 0 5-.9 6.7-2.5l-3.3-2.5a6.2 6.2 0 0 1-9.2-3.2H3.1v2.6A10.5 10.5 0 0 0 12 22Z"
            fill="#34A853"
            stroke="none"
          />
          <path
            d="M6.2 13.8a6.1 6.1 0 0 1 0-3.6V7.6H3.1a10.1 10.1 0 0 0 0 8.8l3.1-2.6Z"
            fill="#FBBC05"
            stroke="none"
          />
          <path
            d="M12 6.2c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.7 9.7 0 0 0 12 2 10.5 10.5 0 0 0 3.1 7.6l3.1 2.6A6.3 6.3 0 0 1 12 6.2Z"
            fill="#EA4335"
            stroke="none"
          />
        </>
      )}
      {name === "shield" && (
        <>
          <path
            d="M12 2.5 20 6v5.5c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6l8-3.5Z"
            {...common}
          />
          <path d="m8.5 12 2.2 2.2 4.8-5" {...common} />
        </>
      )}
      {name === "info" && (
        <>
          <circle cx="12" cy="12" r="9" {...common} />
          <path d="M12 11v6M12 7.5v.2" {...common} />
        </>
      )}
      {name === "target" && (
        <>
          <circle cx="12" cy="12" r="9" {...common} />
          <circle cx="12" cy="12" r="5" {...common} />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </>
      )}
      {name === "calendar" && (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" {...common} />
          <path d="M16 3v4M8 3v4M3 10h18" {...common} />
        </>
      )}
      {name === "clock" && (
        <>
          <circle cx="12" cy="12" r="9" {...common} />
          <path d="M12 7v5l3 2" {...common} />
        </>
      )}
      {name === "timer" && (
        <>
          <circle cx="12" cy="13" r="8" {...common} />
          <path d="M9 2h6M12 5V2M12 9v4l3 2" {...common} />
        </>
      )}
      {name === "play" && (
        <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />
      )}
      {name === "pause" && (
        <>
          <path d="M9 5v14M15 5v14" {...common} />
        </>
      )}
      {name === "bell" && (
        <>
          <path
            d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
            {...common}
          />
        </>
      )}
      {name === "moon" && (
        <path
          d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"
          {...common}
        />
      )}
      {name === "sun" && (
        <>
          <circle cx="12" cy="12" r="4" {...common} />
          <path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            {...common}
          />
        </>
      )}
      {name === "edit" && (
        <>
          <path
            d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"
            {...common}
          />
        </>
      )}
      {name === "logout" && (
        <>
          <path
            d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"
            {...common}
          />
        </>
      )}
      {name === "search" && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" {...common} />
          <path d="m16 16 5 5" {...common} />
        </>
      )}
      {name === "refresh" && (
        <>
          <path d="M20 7v5h-5M4 17v-5h5" {...common} />
          <path
            d="M6.1 8.2A7 7 0 0 1 18.7 7M17.9 15.8A7 7 0 0 1 5.3 17"
            {...common}
          />
        </>
      )}
      {name === "activity" && <path d="M3 12h4l2-7 4 14 2-7h6" {...common} />}
      {name === "sparkles" && (
        <>
          <path
            d="m12 3 1.1 3.4L16.5 7.5l-3.4 1.1L12 12l-1.1-3.4-3.4-1.1 3.4-1.1L12 3Z"
            {...common}
          />
          <path
            d="m19 13 .7 2.3L22 16l-2.3.7L19 19l-.7-2.3L16 16l2.3-.7L19 13ZM5 14l.7 1.8L7.5 16.5l-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7L5 14Z"
            {...common}
          />
        </>
      )}
      {name === "heart" && (
        <path
          d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"
          {...common}
        />
      )}
      {name === "weight" && (
        <>
          <path d="M5 8h14l2 13H3L5 8Z" {...common} />
          <path d="M9 8a3 3 0 0 1 6 0" {...common} />
          <path d="M12 11v3" {...common} />
        </>
      )}
      {name === "trash" && (
        <>
          <path
            d="M4 7h16M9 3h6l1 4H8l1-4ZM6 7l1 14h10l1-14M10 11v6M14 11v6"
            {...common}
          />
        </>
      )}
      {name === "leaf" && (
        <>
          <path d="M20 4S9 3 5 8c-4 5 0 11 5 10 7-1 8-9 10-14Z" {...common} />
          <path d="M4 21c3-6 7-9 12-12" {...common} />
        </>
      )}
      {name === "more" && (
        <>
          <circle cx="5" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="19" cy="12" r="1" fill="currentColor" />
        </>
      )}
      {name === "menu" && (
        <>
          <path d="M4 7h16M4 12h16M4 17h16" {...common} />
        </>
      )}
      {name === "eye" && (
        <>
          <path
            d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
            {...common}
          />
          <circle cx="12" cy="12" r="2.5" {...common} />
        </>
      )}
      {name === "eye-off" && (
        <>
          <path
            d="m3 3 18 18M10.6 6.1A9 9 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.1 2.8M6.4 6.4A16 16 0 0 0 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3-.5M10.5 10.5a2.5 2.5 0 0 0 3 3"
            {...common}
          />
        </>
      )}
    </svg>
  )
}
