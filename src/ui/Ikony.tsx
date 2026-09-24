/** Ikony jako inline SVG – bez dodatkowej biblioteki, sterowane `currentColor`. */

interface Props {
  rozmiar?: number
  klasa?: string
}

const bazowe = (rozmiar: number, klasa?: string) => ({
  width: rozmiar,
  height: rozmiar,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: klasa,
})

export const IkonaPulpit = ({ rozmiar = 22, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M3 13a9 9 0 0 1 18 0" />
    <path d="M12 13l4.5-3.5" />
    <circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none" />
    <path d="M3 17h18" />
  </svg>
)

export const IkonaWykres = ({ rozmiar = 22, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M4 20V10M9 20V4M14 20v-7M19 20V7" />
  </svg>
)

export const IkonaSygnaly = ({ rozmiar = 22, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />
  </svg>
)

export const IkonaNewsy = ({ rozmiar = 22, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M7 9h7M7 13h10M7 17h6" />
  </svg>
)

export const IkonaRynek = ({ rozmiar = 22, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M3 12h4l2.5-7 4 14 2.5-7h5" />
  </svg>
)

export const IkonaNarzedzia = ({ rozmiar = 22, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <path d="M8 8h8M8 12h3M8 16h3M15 12v4" />
  </svg>
)

export const IkonaUstawienia = ({ rozmiar = 22, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

/** Krótki termin – błyskawica. */
export const IkonaBlyskawica = ({ rozmiar = 18, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" fill="currentColor" fillOpacity={0.18} />
  </svg>
)

/** Długi termin – szczyt górski. */
export const IkonaGora = ({ rozmiar = 18, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="m3 19 6-11 4 6.5 2.5-4L21 19z" fill="currentColor" fillOpacity={0.18} />
    <path d="m3 19 6-11 4 6.5 2.5-4L21 19z" />
  </svg>
)

/** Własny horyzont z generatora – suwak. */
export const IkonaSuwak = ({ rozmiar = 18, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2.2" fill="currentColor" fillOpacity={0.18} />
    <circle cx="8" cy="17" r="2.2" fill="currentColor" fillOpacity={0.18} />
  </svg>
)

/** Generowanie – iskra. */
export const IkonaIskra = ({ rozmiar = 18, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path
      d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5z"
      fill="currentColor"
      fillOpacity={0.2}
    />
    <path d="M18.5 16.5v4M16.5 18.5h4" />
  </svg>
)

export const IkonaStrzalkaGora = ({ rozmiar = 16, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
)

export const IkonaStrzalkaDol = ({ rozmiar = 16, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </svg>
)

export const IkonaZegar = ({ rozmiar = 16, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const IkonaOstrzezenie = ({ rozmiar = 16, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
)

export const IkonaOdswiez = ({ rozmiar = 16, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 3v6h-6" />
  </svg>
)

export const IkonaZamknij = ({ rozmiar = 20, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const IkonaStrzalkaPrawo = ({ rozmiar = 16, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

export const IkonaCel = ({ rozmiar = 16, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const IkonaTarcza = ({ rozmiar = 16, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M12 2 4 5.5v6c0 5 3.4 9.3 8 10.5 4.6-1.2 8-5.5 8-10.5v-6z" />
  </svg>
)

export const IkonaLink = ({ rozmiar = 14, klasa }: Props) => (
  <svg {...bazowe(rozmiar, klasa)}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
)
