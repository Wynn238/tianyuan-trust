/* 商品图形：统一扁平插画，避免外部图片依赖 */
const ART = {
  pear: { bg: '#EAF1E7', fg: '#9FBF74', fg2: '#7FA457', accent: '#B07425' },
  rice: { bg: '#F5EFDF', fg: '#D9C08B', fg2: '#B99B5E', accent: '#276345' },
  lamb: { bg: '#F6E7E0', fg: '#C98A76', fg2: '#A96A57', accent: '#8A5A18' },
  banana: { bg: '#F7F0D8', fg: '#E3C05A', fg2: '#C9A33C', accent: '#276345' },
  goji: { bg: '#F8E6E1', fg: '#C6452F', fg2: '#9E3220', accent: '#276345' },
  strawberry: { bg: '#F8E4E1', fg: '#D2453B', fg2: '#A82F28', accent: '#276345' },
  beef: { bg: '#F3E4DE', fg: '#B4574A', fg2: '#8C3B31', accent: '#EAD3AC' },
  orange: { bg: '#FAEBD6', fg: '#E08A2E', fg2: '#BF6E1C', accent: '#276345' },
  apple: { bg: '#F7E6E4', fg: '#C8463C', fg2: '#A3332B', accent: '#276345' },
};

function productArt(name, opts) {
  const c = ART[name] || ART.pear;
  const size = (opts && opts.size) || 240;
  const shapes = {
    pear: `
      <path d="M120 78c-16 0-30 12-30 28 0 14 8 20 8 34 0 26 10 42 22 42s22-16 22-42c0-14 8-20 8-34 0-16-14-28-30-28Z" fill="${c.fg}"/>
      <path d="M120 78c-10 0-18 5-23 13 10-4 24-4 33 3 7 6 10 15 10 26 6-6 10-14 10-24 0-10-13-18-30-18Z" fill="${c.fg2}" opacity=".55"/>
      <path d="M120 78V56" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>
      <path d="M120 58c8-12 22-14 30-10-4 12-16 18-30 14Z" fill="${c.accent}" opacity=".85"/>`,
    rice: `
      <path d="M70 128h100c0 26-22 46-50 46s-50-20-50-46Z" fill="${c.fg}"/>
      <path d="M70 128h100c0 8-2 15-6 21H76c-4-6-6-13-6-21Z" fill="${c.fg2}" opacity=".5"/>
      <path d="M120 128V62" stroke="${c.accent}" stroke-width="3" stroke-linecap="round"/>
      ${Array.from({ length: 6 }).map((_, i) => {
        const y = 70 + i * 9;
        return `<ellipse cx="${110 - (i % 2) * 2}" cy="${y}" rx="7" ry="3.4" fill="${c.accent}" transform="rotate(-28 110 ${y})"/>
                <ellipse cx="${130 + (i % 2) * 2}" cy="${y}" rx="7" ry="3.4" fill="${c.accent}" transform="rotate(28 130 ${y})"/>`;
      }).join('')}`,
    lamb: `
      <path d="M78 96c0-14 12-24 26-24h32c14 0 26 10 26 24v56H78Z" fill="${c.fg}"/>
      <path d="M92 132c8-10 20-14 28-8s20 2 28-8" stroke="${c.fg2}" stroke-width="6" stroke-linecap="round" fill="none" opacity=".6"/>
      <circle cx="164" cy="92" r="12" fill="${c.fg2}"/>
      <path d="M78 152h84" stroke="${c.fg2}" stroke-width="4" stroke-linecap="round"/>`,
    banana: `
      <path d="M74 108c14 34 44 54 78 48 16-3 24-14 20-26-3-10-12-12-22-8-24 9-44-2-56-22-6-10-16-8-20 8Z" fill="${c.fg}"/>
      <path d="M92 112c10 22 32 36 56 34" stroke="${c.fg2}" stroke-width="3" fill="none" opacity=".6"/>
      <path d="M70 104l6 12" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>
      <path d="M164 148l10-6" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>`,
    goji: `
      ${[[104, 96], [138, 90], [122, 118], [92, 128], [150, 124], [116, 150], [146, 152]].map(([x, y], i) =>
        `<ellipse cx="${x}" cy="${y}" rx="11" ry="15" fill="${i % 2 ? c.fg2 : c.fg}" transform="rotate(${(i * 23) % 40 - 20} ${x} ${y})"/>`).join('')}
      <path d="M120 60c-2 16-4 26-8 34" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>
      <path d="M118 66c10-8 22-8 28-2-8 10-18 12-28 6Z" fill="${c.accent}"/>`,
    strawberry: `
      <path d="M120 168c-26 0-46-22-46-46 0-22 20-38 46-38s46 16 46 38c0 24-20 46-46 46Z" fill="${c.fg}"/>
      <path d="M120 168c-26 0-46-22-46-46 0-8 3-15 7-21 6 24 22 40 39 40s33-16 39-40c4 6 7 13 7 21 0 24-20 46-46 46Z" fill="${c.fg2}" opacity=".35"/>
      ${Array.from({ length: 9 }).map((_, i) => {
        const x = 96 + (i % 3) * 24;
        const y = 100 + Math.floor(i / 3) * 20;
        return `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="3.4" fill="#F7EAD5"/>`;
      }).join('')}
      <path d="M96 82c8-12 20-16 24-14 4-2 16 2 24 14-12 6-36 6-48 0Z" fill="${c.accent}"/>`,
    beef: `
      <path d="M78 108c0-20 18-34 42-34s42 14 42 34-18 40-42 40-42-20-42-40Z" fill="${c.fg}"/>
      <path d="M92 108c8-12 20-16 28-14 10-2 20 4 26 14-6 14-16 20-27 20s-21-6-27-20Z" fill="${c.fg2}" opacity=".5"/>
      <path d="M86 120c14 6 54 6 68 0" stroke="${c.accent}" stroke-width="5" stroke-linecap="round" opacity=".8"/>`,
    orange: `
      <circle cx="120" cy="116" r="46" fill="${c.fg}"/>
      <circle cx="120" cy="116" r="46" fill="none" stroke="${c.fg2}" stroke-width="2" opacity=".5"/>
      <path d="M120 70c-2-10-8-18-18-22" stroke="${c.accent}" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M120 68c10-12 24-14 32-8-6 12-20 16-32 8Z" fill="${c.accent}"/>
      <circle cx="120" cy="116" r="30" fill="none" stroke="${c.fg2}" stroke-width="1.5" opacity=".35"/>
      ${[0, 60, 120, 180, 240, 300].map((a) => `<path d="M120 116 L${120 + 30 * Math.cos(a * Math.PI / 180)} ${116 + 30 * Math.sin(a * Math.PI / 180)}" stroke="${c.fg2}" stroke-width="1.2" opacity=".3"/>`).join('')}`,
    apple: `
      <path d="M120 82c-10-8-28-8-38 6-12 16-6 52 14 66 10 6 18 6 24 2 6 4 14 4 24-2 20-14 26-50 14-66-10-14-28-14-38-6Z" fill="${c.fg}"/>
      <path d="M120 78V58" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>
      <path d="M121 60c8-12 22-16 30-12-4 12-16 18-30 12Z" fill="${c.accent}"/>`,
  };
  const body = shapes[name] || shapes.pear;
  return `<svg viewBox="0 0 240 240" width="${size}" height="${size}" role="img" aria-label="农产品插画">
    <rect width="240" height="240" rx="24" fill="${c.bg}"/>
    <circle cx="196" cy="48" r="26" fill="#fff" opacity=".35"/>
    <circle cx="44" cy="196" r="34" fill="#fff" opacity=".25"/>
    ${body}
  </svg>`;
}

/* 商品视角插画：果径 / 切面 / 包装 / 产地，避免四张缩略图共用同一张图 */
function productViewArt(name, view, opts) {
  const c = ART[name] || ART.pear;
  const size = (opts && opts.size) || 160;
  const v = view || 'size';
  const scenes = {
    size: `
      <ellipse cx="96" cy="112" rx="34" ry="44" fill="${c.fg}"/>
      <ellipse cx="86" cy="100" rx="14" ry="20" fill="${c.fg2}" opacity=".35"/>
      <path d="M96 66V44" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>
      <path d="M97 50c8-10 20-12 26-8-4 10-15 15-26 8Z" fill="${c.accent}"/>
      <path d="M146 62v84" stroke="${c.fg2}" stroke-width="1.5" stroke-dasharray="3 5"/>
      ${Array.from({ length: 7 }).map((_, i) => `<path d="M140 ${68 + i * 13}h12" stroke="${c.fg2}" stroke-width="1.5"/>`).join('')}`,
    cut: `
      <path d="M96 70c-26 0-44 22-44 48 0 20 18 34 44 34s44-14 44-34c0-26-18-48-44-48Z" fill="${c.bg}"/>
      <path d="M96 76c-22 0-38 19-38 42 0 17 16 28 38 28s38-11 38-28c0-23-16-42-38-42Z" fill="${c.fg2}" opacity=".55"/>
      <path d="M96 92c-12 0-20 10-20 22 0 10 8 17 20 17s20-7 20-17c0-12-8-22-20-22Z" fill="#F7EAD5"/>
      ${[[88, 112], [104, 110], [96, 122], [90, 101], [101, 100]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2" ry="3" fill="${c.fg2}"/>`).join('')}
      <path d="M96 70v-8" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>`,
    pack: `
      <rect x="48" y="78" width="104" height="72" rx="6" fill="${c.fg2}" opacity=".28"/>
      <rect x="48" y="78" width="104" height="72" rx="6" fill="none" stroke="${c.accent}" stroke-width="2"/>
      <path d="M48 96h104" stroke="${c.accent}" stroke-width="2"/>
      <rect x="112" y="106" width="26" height="26" rx="3" fill="#FFFDF6" stroke="${c.accent}"/>
      ${[[116, 110], [124, 110], [116, 118], [128, 118], [120, 124]].map(([x, y]) => `<rect x="${x}" y="${y}" width="4" height="4" fill="${c.accent}"/>`).join('')}
      <rect x="62" y="104" width="38" height="3" fill="${c.accent}" opacity=".5"/>
      <rect x="62" y="112" width="26" height="3" fill="${c.accent}" opacity=".35"/>
      <circle cx="70" cy="126" r="9" fill="none" stroke="${c.accent}" stroke-width="1.5" opacity=".55"/>`,
    origin: `
      <circle cx="144" cy="58" r="16" fill="${c.accent}" opacity=".35"/>
      <path d="M20 142c18-26 36-38 58-38s42 16 56 38Z" fill="${c.fg}" opacity=".45"/>
      <path d="M62 142c12-18 24-26 38-26s28 10 38 26Z" fill="${c.fg2}" opacity=".55"/>
      <path d="M18 152h164" stroke="${c.accent}" stroke-width="2" opacity=".5"/>
      ${[0, 1, 2].map((i) => `<path d="M${30 + i * 8} ${160 + i * 10}c40-10 92-10 132 0" stroke="${c.fg2}" stroke-width="1.5" fill="none" opacity=".5"/>`).join('')}
      <path d="M156 126v-26" stroke="${c.accent}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="156" cy="96" r="12" fill="${c.fg2}" opacity=".6"/>`,
  };
  return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="商品视角插画">
    <rect width="200" height="200" rx="20" fill="${c.bg}"/>
    ${scenes[v] || scenes.size}
  </svg>`;
}
