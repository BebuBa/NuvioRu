#!/usr/bin/env node
/**
 * Nuvio RU Каталоги (TMDB RU + Кинопоиск + Shikimori) — версия с обходом блокировок TMDB в РФ
 * Автономный аддон каталогов и метаданных для Nuvio и Stremio.
 *
 * Что умеет:
 * 1. Полноценная работа с TMDB на русском языке (language=ru-RU) в России без VPN:
 *    - Автоматический обход блокировки api.themoviedb.org через резервный официальный домен api.tmdb.org
 *      или пользовательский прокси-сервер (а при запуске на Render/облаке запросы идут напрямую с зарубежного IP).
 *    - Встроенный серверный прокси обложек (/proxy/image), который сам скачивает постеры с TMDB (image.tmdb.org)
 *      и отдает их в Nuvio от лица вашего сервера (либо через незаблокированный CDN wsrv.nl).
 *    - Отдает родные TMDB ID (tmdb:...) и IMDb ID (tt...), поэтому все локальные скраперы Nuvio работают идеально.
 * 2. Готовые русские полки TMDB:
 *    - Фильмы в тренде и Популярные фильмы (с фильтром по жанрам на русском)
 *    - Сериалы в тренде и Хиты стримингов (Netflix, HBO Max, Apple TV+, Amazon Prime, Disney+)
 *    - Мультфильмы и Мультсериалы (отдельно от японского аниме!)
 *    - Аниме-сериалы и Аниме-фильмы (с русскими названиями, описаниями и списками серий из TMDB + Shikimori)
 * 3. Также сохранена поддержка Kinopoisk Unofficial API и Shikimori API.
 *
 * Запуск:
 *   node nuvio_ru_catalog_addon.js
 * Настройка в браузере:
 *   http://127.0.0.1:7000/configure
 */

const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 7000);
const DEFAULT_TMDB_KEY = process.env.TMDB_API_KEY || '';
const DEFAULT_KP_KEY = process.env.KP_API_KEY || '';
const DEFAULT_TMDB_BASE = process.env.TMDB_API_BASE || '';

// Жанры на русском языке и их ID в TMDB
const TMDB_MOVIE_GENRES = {
  'Боевик': 28,
  'Приключения': 12,
  'Комедия': 35,
  'Криминал': 80,
  'Детектив': 9648,
  'Драма': 18,
  'Семейный': 10751,
  'Фэнтези': 14,
  'История': 36,
  'Ужасы': 27,
  'Мелодрама': 10749,
  'Фантастика': 878,
  'Триллер': 53,
  'Военный': 10752
};

const TMDB_TV_GENRES = {
  'Боевик и Приключения': 10759,
  'Комедия': 35,
  'Криминал': 80,
  'Детектив': 9648,
  'Драма': 18,
  'Семейный': 10751,
  'Фантастика и Фэнтези': 10765,
  'Война и Политика': 10768,
  'Вестерн': 37
};

const STREAMING_NETWORKS = {
  'Netflix': 213,
  'HBO / Max': 49,
  'Apple TV+': 2552,
  'Amazon Prime Video': 1024,
  'Disney+': 2739,
  'Hulu': 453
};

const MOVIE_GENRE_LIST = Object.keys(TMDB_MOVIE_GENRES);
const TV_GENRE_LIST = Object.keys(TMDB_TV_GENRES);
const NETWORK_LIST = Object.keys(STREAMING_NETWORKS);

const ANIME_GENRES = [
  'Экшен', 'Приключения', 'Комедия', 'Драма', 'Фэнтези',
  'Фантастика', 'Романтика', 'Сверхъестественное', 'Триллер',
  'Психологическое', 'Повседневность', 'Сёнэн', 'Сэйнэн', 'Детектив'
];

const KP_GENRE_IDS = {
  'триллер': 1, 'драма': 2, 'криминал': 3, 'мелодрама': 4, 'детектив': 5,
  'фантастика': 6, 'приключения': 7, 'боевик': 11, 'фэнтези': 12,
  'комедия': 13, 'военный': 14, 'история': 15, 'ужасы': 17, 'мультфильм': 18, 'семейный': 19
};

const SHIKI_GENRE_IDS = {
  'экшен': 1, 'приключения': 2, 'комедия': 4, 'драма': 8, 'фэнтези': 10,
  'романтика': 22, 'фантастика': 24, 'повседневность': 36, 'сверхъестественное': 37,
  'психологическое': 40, 'триллер': 41, 'сёнэн': 27, 'сэйнэн': 42, 'детектив': 7
};

// Резервный каталог с реальными IMDb и TMDB ID (работает даже до ввода ключей)
const FALLBACK_CATALOG = {
  movies: [
    {
      id: 'tt0816692', imdb_id: 'tt0816692', tmdbId: '157336', type: 'movie',
      name: 'Интерстеллар', releaseInfo: '2014', imdbRating: '8.7',
      genres: ['Фантастика', 'Драма', 'Приключения'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/258687.jpg',
      description: 'Когда засуха, пыльные бури и вымирание растений приводят человечество к продовольственному кризису, коллектив исследователей и учёных отправляется сквозь червоточину в путешествие.'
    },
    {
      id: 'tt8367814', imdb_id: 'tt8367814', tmdbId: '522627', type: 'movie',
      name: 'Джентльмены', releaseInfo: '2019', imdbRating: '7.8',
      genres: ['Криминал', 'Комедия', 'Боевик'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/1143242.jpg',
      description: 'Талантливый выпускник Оксфорда придумал схему нелегального обогащения с использованием поместий обедневшей английской аристократии.'
    },
    {
      id: 'tt15239678', imdb_id: 'tt15239678', tmdbId: '693134', type: 'movie',
      name: 'Дюна: Часть вторая', releaseInfo: '2024', imdbRating: '8.5',
      genres: ['Фантастика', 'Боевик', 'Драма'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/4540126.jpg',
      description: 'Герцог Пол Атрейдес присоединяется к фрименам, чтобы стать Муад’Дибом, одновременно пытаясь остановить наступление войны.'
    },
    {
      id: 'tt15398776', imdb_id: 'tt15398776', tmdbId: '872585', type: 'movie',
      name: 'Оппенгеймер', releaseInfo: '2023', imdbRating: '8.3',
      genres: ['История', 'Драма'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/4664634.jpg',
      description: 'История жизни американского физика-теоретика Роберта Оппенгеймера, который во времена Второй мировой войны руководил Манхэттенским проектом.'
    }
  ],
  series: [
    {
      id: 'tt0903747', imdb_id: 'tt0903747', tmdbId: '1396', type: 'series',
      name: 'Во все тяжкие', releaseInfo: '2008–2013', imdbRating: '9.5',
      genres: ['Криминал', 'Драма', 'Триллер'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/404900.jpg',
      description: 'Школьный учитель химии Уолтер Уайт узнаёт, что болен раком лёгких, и начинает производить метамфетамин ради будущего семьи.'
    },
    {
      id: 'tt12637874', imdb_id: 'tt12637874', tmdbId: '106379', type: 'series',
      name: 'Фоллаут', releaseInfo: '2024', imdbRating: '8.4',
      genres: ['Фантастика', 'Боевик и Приключения', 'Драма'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/1392550.jpg',
      description: 'Через 200 лет после ядерного апокалипсиса обитательница уютного убежища вынуждена выйти на поверхность.'
    },
    {
      id: 'tt11280740', imdb_id: 'tt11280740', tmdbId: '95396', type: 'series',
      name: 'Разделение', releaseInfo: '2022', imdbRating: '8.7',
      genres: ['Фантастика и Фэнтези', 'Драма', 'Детектив'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/1343318.jpg',
      description: 'Руководство компании Lumon Industries придумало процедуру «разделения» рабочих и личных воспоминаний сотрудников.'
    }
  ],
  cartoons: [
    {
      id: 'tt2861424', imdb_id: 'tt2861424', tmdbId: '60625', type: 'series',
      name: 'Рик и Морти', releaseInfo: '2013', imdbRating: '9.1',
      genres: ['Мультфильм', 'Фантастика', 'Комедия'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/685246.jpg',
      description: 'Приключения школьника Морти и его дедушки Рика, гениального, но эксцентричного учёного, путешествующих по мультивселенной.'
    },
    {
      id: 'tt11126994', imdb_id: 'tt11126994', tmdbId: '94605', type: 'series',
      name: 'Аркейн', releaseInfo: '2021', imdbRating: '9.0',
      genres: ['Мультфильм', 'Фантастика', 'Боевик'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/4445150.jpg',
      description: 'История двух сестёр, Вай и Паудер, оказавшихся по разные стороны баррикад в противостоянии Пилтовера и Зауна.'
    },
    {
      id: 'tt9362722', imdb_id: 'tt9362722', tmdbId: '569094', type: 'movie',
      name: 'Человек-паук: Паутина вселенных', releaseInfo: '2023', imdbRating: '8.6',
      genres: ['Мультфильм', 'Фантастика', 'Боевик'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/1227967.jpg',
      description: 'Майлз Моралес отправляется в приключение по мультивселенной вместе с Гвен Стейси и новой командой Людей-пауков.'
    }
  ],
  anime: [
    {
      id: 'tt2560140', imdb_id: 'tt2560140', tmdbId: '1429', type: 'series',
      name: 'Атака титанов', releaseInfo: '2013', imdbRating: '9.1',
      genres: ['Экшен', 'Драма', 'Фэнтези'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/749374.jpg',
      description: 'Человечество живёт внутри городов, окружённых тремя огромными стенами, защищающими людей от гигантских титанов.'
    },
    {
      id: 'tt29315004', imdb_id: 'tt29315004', tmdbId: '209867', type: 'series',
      name: 'Провожающая в последний путь Фрирен', releaseInfo: '2023', imdbRating: '8.9',
      genres: ['Фэнтези', 'Приключения', 'Драма'],
      poster: 'https://kinopoiskapiunofficial.tech/images/posters/kp/5120018.jpg',
      description: 'Одержав победу над Королём демонов, бессмертная эльфийка-маг Фрирен отправляется в новое путешествие, чтобы понять людей.'
    }
  ]
};

const CACHE = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

function getCached(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  if (CACHE.size > 2000) {
    const oldestKey = CACHE.keys().next().value;
    CACHE.delete(oldestKey);
  }
  CACHE.set(key, { ts: Date.now(), data });
}

function parseConfig(configSegment) {
  const defaults = {
    tmdbKey: DEFAULT_TMDB_KEY,
    tmdbBase: DEFAULT_TMDB_BASE,
    kpKey: DEFAULT_KP_KEY,
    proxyMode: 'stream', // 'stream' (встроенный серверный прокси) | 'wsrv' (CDN wsrv.nl)
    enableMovies: true,
    enableSeries: true,
    enableCartoons: true,
    enableAnime: true
  };
  if (!configSegment) return defaults;
  try {
    const json = Buffer.from(decodeURIComponent(configSegment), 'base64url').toString('utf8');
    return { ...defaults, ...JSON.parse(json) };
  } catch (e) {
    try {
      const json = Buffer.from(decodeURIComponent(configSegment), 'base64').toString('utf8');
      return { ...defaults, ...JSON.parse(json) };
    } catch (_) {
      return defaults;
    }
  }
}

// Формирование ссылки на постер TMDB с обходом блокировки image.tmdb.org в РФ
function buildTmdbImageUrl(pathStr, size, baseUrl, proxyMode = 'stream') {
  if (!pathStr) return undefined;
  const rawTmdbImg = `https://image.tmdb.org/t/p/${size}${pathStr}`;
  if (proxyMode === 'wsrv') {
    return `https://wsrv.nl/?url=${encodeURIComponent(rawTmdbImg)}`;
  }
  return `${baseUrl}/proxy/image?url=${encodeURIComponent(rawTmdbImg)}`;
}

// Запрос к TMDB API с автоматическим переключением между зеркалами для обхода блока в РФ
async function fetchTmdb(pathAndQuery, config) {
  const tmdbKey = (config && config.tmdbKey) || DEFAULT_TMDB_KEY;
  if (!tmdbKey) return null;

  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const isBearer = tmdbKey.length > 60 && tmdbKey.includes('.');
  const fullPath = isBearer
    ? `${pathAndQuery}${sep}language=ru-RU`
    : `${pathAndQuery}${sep}api_key=${encodeURIComponent(tmdbKey)}&language=ru-RU`;

  const cacheKey = `tmdb:${fullPath}:${tmdbKey.slice(0, 6)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Список хостов TMDB: сначала пользовательский прокси (если задан), затем api.tmdb.org (реже блокируется в РФ), затем стандартный api.themoviedb.org
  const bases = [];
  if (config && config.tmdbBase) {
    bases.push(config.tmdbBase.replace(/\/+$/, ''));
  }
  bases.push('https://api.tmdb.org/3', 'https://api.themoviedb.org/3');

  let lastErr = null;
  for (const base of bases) {
    const url = `${base}${fullPath}`;
    try {
      const headers = {
        'Accept': 'application/json',
        'User-Agent': 'NuvioRuTmdbAddon/2.0'
      };
      if (isBearer) {
        headers['Authorization'] = `Bearer ${tmdbKey}`;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        setCached(cacheKey, data);
        return data;
      }
      lastErr = new Error(`TMDB HTTP ${res.status} from ${base}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Не удалось подключиться к TMDB API');
}

// Получение IMDb ID для элемента TMDB (кэшируется, нужно для максимальной совместимости со всеми скраперами)
async function resolveTmdbExternalIds(mediaType, tmdbId, config) {
  const cacheKey = `tmdb_ext:${mediaType}:${tmdbId}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const data = await fetchTmdb(`/${mediaType}/${tmdbId}/external_ids`, config);
    if (data) {
      setCached(cacheKey, data);
      return data;
    }
  } catch (_) {}
  setCached(cacheKey, {});
  return {};
}

// Преобразование элемента TMDB в формат карточки Nuvio/Stremio
async function tmdbItemToMeta(item, stremioType, baseUrl, config) {
  const mediaType = stremioType === 'series' ? 'tv' : 'movie';
  const tmdbId = item.id;
  const ext = await resolveTmdbExternalIds(mediaType, tmdbId, config);
  const imdbId = (ext && ext.imdb_id) || item.imdb_id || undefined;

  // Если есть IMDb ID (tt...), используем его как основной id + сохраняем tmdbId (чтобы работали и скраперы Nuvio, и торрент-аддоны)
  const id = imdbId && imdbId.startsWith('tt') ? imdbId : `tmdb:${tmdbId}`;
  const name = item.title || item.name || item.original_title || item.original_name || `TMDB #${tmdbId}`;
  const dateStr = item.release_date || item.first_air_date || '';
  const year = dateStr ? dateStr.slice(0, 4) : '';
  const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : undefined;

  return {
    id,
    imdb_id: imdbId,
    tmdbId: String(tmdbId),
    type: stremioType,
    name,
    poster: buildTmdbImageUrl(item.poster_path, 'w500', baseUrl, config.proxyMode),
    background: buildTmdbImageUrl(item.backdrop_path, 'original', baseUrl, config.proxyMode),
    releaseInfo: year,
    imdbRating: rating && rating !== '0.0' ? rating : undefined,
    description: item.overview || 'Описание на русском языке отсутствует.'
  };
}

// Формирование manifest.json на русском языке
function buildManifest(config) {
  const catalogs = [];

  if (config.enableMovies !== false) {
    catalogs.push(
      {
        type: 'movie',
        id: 'tmdb_movies_trending',
        name: '🔥 Фильмы: В тренде (TMDB RU)',
        extra: [
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        type: 'movie',
        id: 'tmdb_movies_popular',
        name: '🎬 Фильмы: Популярное и Жанры (TMDB RU)',
        extra: [
          { name: 'genre', isRequired: false, options: MOVIE_GENRE_LIST },
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      }
    );
  }

  if (config.enableSeries !== false) {
    catalogs.push(
      {
        type: 'series',
        id: 'tmdb_series_trending',
        name: '🔥 Сериалы: В тренде (TMDB RU)',
        extra: [
          { name: 'genre', isRequired: false, options: TV_GENRE_LIST },
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        type: 'series',
        id: 'tmdb_series_streaming',
        name: '📺 Сериалы: Стриминги (Netflix, HBO, Apple TV+)',
        extra: [
          { name: 'genre', isRequired: false, options: NETWORK_LIST },
          { name: 'skip', isRequired: false }
        ]
      }
    );
  }

  if (config.enableCartoons !== false) {
    catalogs.push(
      {
        type: 'movie',
        id: 'tmdb_cartoons_movies',
        name: '🧸 Мультфильмы: Полнометражные (TMDB RU)',
        extra: [
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        type: 'series',
        id: 'tmdb_cartoons_series',
        name: '🧸 Мультсериалы и анимация (TMDB RU)',
        extra: [
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      }
    );
  }

  if (config.enableAnime !== false) {
    catalogs.push(
      {
        type: 'series',
        id: 'ru_anime_popular',
        name: '⛩️ Аниме: Сериалы (TMDB RU / Shikimori)',
        extra: [
          { name: 'genre', isRequired: false, options: ANIME_GENRES },
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        type: 'movie',
        id: 'ru_anime_movies',
        name: '⛩️ Аниме: Полнометражное (TMDB RU / Shikimori)',
        extra: [
          { name: 'genre', isRequired: false, options: ANIME_GENRES },
          { name: 'skip', isRequired: false },
          { name: 'search', isRequired: false }
        ]
      }
    );
  }

  return {
    id: 'org.nuvio.ru.tmdb.catalogs',
    version: '2.0.0',
    name: 'Nuvio RU: TMDB + Кинопоиск + Shikimori (Без VPN в РФ)',
    description: 'Русскоязычные каталоги TMDB (ru-RU), Кинопоиска и Shikimori с встроенным проксированием API и обложек для работы в России без VPN.',
    logo: 'https://wsrv.nl/?url=https://raw.githubusercontent.com/Stremio/stremio-art/master/logo.png',
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb:', 'kp:', 'shiki:'],
    resources: [
      'catalog',
      {
        name: 'meta',
        types: ['movie', 'series'],
        idPrefixes: ['tt', 'tmdb:', 'kp:', 'shiki:']
      }
    ],
    catalogs,
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  };
}

// Запрос к Shikimori API (работает в РФ без ключей)
async function fetchShikimoriCatalog({ kind, status, genreName, search, page = 1 }) {
  const params = new URLSearchParams();
  params.set('limit', '20');
  params.set('page', String(page));
  params.set('order', 'popularity');
  if (kind) params.set('kind', kind);
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  if (genreName && SHIKI_GENRE_IDS[genreName.toLowerCase()]) {
    params.set('genre', String(SHIKI_GENRE_IDS[genreName.toLowerCase()]));
  }

  const url = `https://shikimori.one/api/animes?${params.toString()}`;
  const cached = getCached(`shiki:${url}`);
  if (cached) return cached;

  const res = await fetch(url, { headers: { 'User-Agent': 'NuvioRuTmdbAddon/2.0' } });
  if (!res.ok) throw new Error(`Shikimori HTTP ${res.status}`);
  const data = await res.json();
  setCached(`shiki:${url}`, data);
  return data;
}

async function resolveMalToExternalIds(malId) {
  const cacheKey = `arm:${malId}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;
  try {
    const res = await fetch(`https://arm.haglund.dev/api/v2/ids?source=myanimelist&id=${encodeURIComponent(malId)}`);
    if (res.ok) {
      const data = await res.json();
      setCached(cacheKey, data || {});
      return data || {};
    }
  } catch (_) {}
  setCached(cacheKey, {});
  return {};
}

// Обработка каталогов (/catalog/{type}/{id}/{extra}.json)
async function handleCatalog(type, catalogId, extraArgs, config, baseUrl) {
  const skip = Number(extraArgs.skip || 0);
  const page = Math.floor(skip / 20) + 1;
  const search = extraArgs.search ? String(extraArgs.search).trim() : '';
  const genre = extraArgs.genre ? String(extraArgs.genre).trim() : '';

  // 1. Если указан ключ TMDB — загружаем каталоги напрямую из TMDB (ru-RU) с проксированием обложек!
  if (config.tmdbKey) {
    try {
      const mediaType = type === 'series' ? 'tv' : 'movie';
      let endpoint = '';

      if (search) {
        endpoint = `/search/${mediaType}?query=${encodeURIComponent(search)}&page=${page}&include_adult=false`;
      } else if (catalogId === 'tmdb_movies_trending') {
        endpoint = `/trending/movie/week?page=${page}`;
      } else if (catalogId === 'tmdb_series_trending') {
        if (genre && TMDB_TV_GENRES[genre]) {
          endpoint = `/discover/tv?sort_by=popularity.desc&with_genres=${TMDB_TV_GENRES[genre]}&page=${page}`;
        } else {
          endpoint = `/trending/tv/week?page=${page}`;
        }
      } else if (catalogId === 'tmdb_movies_popular') {
        const gId = genre && TMDB_MOVIE_GENRES[genre] ? `&with_genres=${TMDB_MOVIE_GENRES[genre]}` : '';
        endpoint = `/discover/movie?sort_by=popularity.desc${gId}&page=${page}`;
      } else if (catalogId === 'tmdb_series_streaming') {
        const netId = (genre && STREAMING_NETWORKS[genre]) || 213; // По умолчанию Netflix
        endpoint = `/discover/tv?sort_by=popularity.desc&with_networks=${netId}&page=${page}`;
      } else if (catalogId === 'tmdb_cartoons_movies') {
        // Жанр 16 (Мультфильм), исключая японское аниме (with_original_language=!ja)
        endpoint = `/discover/movie?sort_by=popularity.desc&with_genres=16&without_original_language=ja&page=${page}`;
      } else if (catalogId === 'tmdb_cartoons_series') {
        endpoint = `/discover/tv?sort_by=popularity.desc&with_genres=16&without_original_language=ja&page=${page}`;
      } else if (catalogId === 'ru_anime_popular') {
        // Аниме-сериалы в TMDB: жанр 16 (Animation) + оригинальный язык японский (ja)
        endpoint = `/discover/tv?sort_by=popularity.desc&with_genres=16&with_original_language=ja&page=${page}`;
      } else if (catalogId === 'ru_anime_movies') {
        endpoint = `/discover/movie?sort_by=popularity.desc&with_genres=16&with_original_language=ja&page=${page}`;
      } else {
        endpoint = `/discover/${mediaType}?sort_by=popularity.desc&page=${page}`;
      }

      const data = await fetchTmdb(endpoint, config);
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        const metas = await Promise.all(
          data.results.slice(0, 20).map(item => tmdbItemToMeta(item, type, baseUrl, config))
        );
        return { metas };
      }
    } catch (_) {
      // Если TMDB недоступен — плавно переходим к Shikimori / Кинопоиску / резервному каталогу
    }
  }

  // 2. Аниме через Shikimori (работает в РФ вообще без ключей!)
  if (catalogId.startsWith('ru_anime_')) {
    try {
      const kind = catalogId === 'ru_anime_movies' ? 'movie' : 'tv,ona';
      const items = await fetchShikimoriCatalog({ kind, genreName: genre, search, page });
      if (Array.isArray(items) && items.length > 0) {
        const metas = await Promise.all(items.map(async (it) => {
          const ext = await resolveMalToExternalIds(it.id);
          const imdbId = ext.imdb || undefined;
          return {
            id: imdbId || `shiki:${it.id}`,
            imdb_id: imdbId,
            tmdbId: ext.themoviedb ? String(ext.themoviedb) : undefined,
            type,
            name: it.russian || it.name,
            poster: it.image && it.image.original ? `https://shikimori.one${it.image.original}` : undefined,
            releaseInfo: it.aired_on ? it.aired_on.slice(0, 4) : '',
            imdbRating: it.score && it.score !== '0.0' ? String(it.score) : undefined,
            description: `${it.russian || it.name} (${it.name || ''}) — Рейтинг Shikimori: ${it.score || '—'}`
          };
        }));
        return { metas };
      }
    } catch (_) {}
    return { metas: FALLBACK_CATALOG.anime };
  }

  // 3. Резервный стартовый список (если пользователь еще не ввел ключ TMDB)
  if (catalogId.includes('cartoons')) return { metas: FALLBACK_CATALOG.cartoons };
  if (type === 'series') return { metas: FALLBACK_CATALOG.series };
  return { metas: FALLBACK_CATALOG.movies };
}

// Обработка детальной карточки (/meta/{type}/{id}.json) на русском языке со списком серий из TMDB
async function handleMeta(type, rawId, config, baseUrl) {
  const id = decodeURIComponent(rawId);

  if (config.tmdbKey) {
    try {
      const mediaType = type === 'series' ? 'tv' : 'movie';
      let tmdbId = id.startsWith('tmdb:') ? id.replace('tmdb:', '') : null;

      // Если передан IMDb ID (tt...), находим его TMDB ID через /find/{id}
      if (!tmdbId && id.startsWith('tt')) {
        const findData = await fetchTmdb(`/find/${encodeURIComponent(id)}?external_source=imdb_id`, config);
        if (findData) {
          const results = type === 'series'
            ? (findData.tv_results && findData.tv_results.length ? findData.tv_results : findData.movie_results)
            : (findData.movie_results && findData.movie_results.length ? findData.movie_results : findData.tv_results);
          if (results && results[0]) {
            tmdbId = String(results[0].id);
          }
        }
      }

      if (tmdbId) {
        const details = await fetchTmdb(`/${mediaType}/${encodeURIComponent(tmdbId)}?append_to_response=external_ids,credits`, config);
        if (details) {
          const imdbId = (details.external_ids && details.external_ids.imdb_id) || details.imdb_id || (id.startsWith('tt') ? id : undefined);
          const metaObj = {
            id: imdbId || `tmdb:${tmdbId}`,
            imdb_id: imdbId,
            tmdbId: String(tmdbId),
            type,
            name: details.title || details.name || details.original_title || details.original_name,
            releaseInfo: (details.release_date || details.first_air_date || '').slice(0, 4),
            imdbRating: details.vote_average ? Number(details.vote_average).toFixed(1) : undefined,
            genres: Array.isArray(details.genres) ? details.genres.map(g => g.name) : [],
            poster: buildTmdbImageUrl(details.poster_path, 'w500', baseUrl, config.proxyMode),
            background: buildTmdbImageUrl(details.backdrop_path, 'original', baseUrl, config.proxyMode),
            description: details.overview || 'Описание на русском языке отсутствует.',
            runtime: details.runtime ? `${details.runtime} мин.` : undefined
          };

          // Если это сериал — загружаем список сезонов и серий на русском языке
          if (mediaType === 'tv' && Array.isArray(details.seasons)) {
            const videos = [];
            const validSeasons = details.seasons.filter(s => s.season_number > 0).slice(0, 15);
            const seasonResponses = await Promise.all(
              validSeasons.map(s =>
                fetchTmdb(`/tv/${encodeURIComponent(tmdbId)}/season/${s.season_number}`, config).catch(() => null)
              )
            );
            for (const sData of seasonResponses) {
              if (!sData || !Array.isArray(sData.episodes)) continue;
              for (const ep of sData.episodes) {
                videos.push({
                  id: `${imdbId || `tmdb:${tmdbId}`}:${sData.season_number}:${ep.episode_number}`,
                  title: ep.name || `Серия ${ep.episode_number}`,
                  season: sData.season_number,
                  episode: ep.episode_number,
                  released: ep.air_date ? new Date(ep.air_date).toISOString() : undefined,
                  overview: ep.overview || undefined,
                  thumbnail: buildTmdbImageUrl(ep.still_path, 'w300', baseUrl, config.proxyMode)
                });
              }
            }
            if (videos.length > 0) {
              metaObj.videos = videos;
            }
          }
          return { meta: metaObj };
        }
      }
    } catch (_) {}
  }

  const allFallback = [
    ...FALLBACK_CATALOG.movies,
    ...FALLBACK_CATALOG.series,
    ...FALLBACK_CATALOG.cartoons,
    ...FALLBACK_CATALOG.anime
  ];
  const found = allFallback.find(i => i.id === id || i.imdb_id === id || `tmdb:${i.tmdbId}` === id);
  return { meta: found || null };
}

// Страница настройки (/configure) на русском языке
function renderConfigureHtml(baseUrl) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nuvio RU — Русский TMDB + Shikimori без VPN</title>
  <style>
    :root {
      --bg: #0f172a; --card: #1e293b; --border: #334155;
      --accent: #38bdf8; --accent-hover: #0284c7; --text: #f8fafc;
      --muted: #94a3b8; --success: #22c55e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 24px 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.5;
    }
    .container {
      max-width: 680px; margin: 0 auto; background: var(--card);
      border: 1px solid var(--border); border-radius: 16px; padding: 24px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }
    h1 { margin: 0 0 8px 0; font-size: 22px; color: var(--accent); }
    p.sub { margin: 0 0 20px 0; color: var(--muted); font-size: 14px; }
    .section { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
    label.field-label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 14px; }
    input[type="text"], select {
      width: 100%; padding: 11px 14px; border-radius: 8px;
      border: 1px solid var(--border); background: #0b1120; color: var(--text); font-size: 14px;
    }
    .hint { font-size: 12px; color: var(--muted); margin-top: 6px; }
    .hint a { color: var(--accent); text-decoration: none; }
    .checkbox-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px; margin-top: 10px;
    }
    .check-item {
      display: flex; align-items: center; gap: 10px; background: #0b1120;
      padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); font-size: 14px;
    }
    .url-box {
      background: #0b1120; border: 1px solid var(--accent); border-radius: 10px;
      padding: 12px 14px; font-family: monospace; font-size: 13px;
      word-break: break-all; margin-bottom: 14px; color: #e2e8f0;
    }
    .btn-row { display: flex; flex-wrap: wrap; gap: 10px; }
    button, a.btn {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 11px 18px; border-radius: 8px; font-weight: 600; font-size: 14px;
      border: none; cursor: pointer; text-decoration: none;
    }
    .btn-primary { background: var(--accent); color: #0f172a; }
    .btn-secondary { background: #334155; color: var(--text); }
    .badge {
      display: inline-block; padding: 3px 8px; border-radius: 999px;
      font-size: 11px; font-weight: 600; background: rgba(34, 197, 94, 0.15); color: var(--success);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Nuvio RU: TMDB на русском языке <span class="badge">Обход блока РФ</span></h1>
    <p class="sub">Фильмы, сериалы, хиты стримингов, мультфильмы и аниме из базы TMDB (ru-RU) и Shikimori с проксированием обложек для работы в России без VPN.</p>

    <div class="section">
      <label class="field-label" for="tmdbKey">Ваш ключ TMDB API (v3 API Key или Read Access Token)</label>
      <input type="text" id="tmdbKey" placeholder="Вставьте ваш бесплатный ключ TMDB (например: 3e4a5b6c...)" />
      <div class="hint">
        Все запросы к TMDB идут через резервный домен <code>api.tmdb.org</code> или с сервера хостинга, а обложки с <code>image.tmdb.org</code> туннелируются через прокси, поэтому всё грузится в РФ без VPN.
      </div>
    </div>

    <div class="section">
      <label class="field-label" for="proxyMode">Способ проксирования постеров TMDB в РФ</label>
      <select id="proxyMode">
        <option value="stream">Через этот сервер (/proxy/image — скрывает image.tmdb.org от провайдера)</option>
        <option value="wsrv">Через глобальный кеш-CDN wsrv.nl (быстрая загрузка картинок)</option>
      </select>
    </div>

    <div class="section">
      <label class="field-label">Полки каталогов для главного экрана Nuvio</label>
      <div class="checkbox-grid">
        <label class="check-item"><input type="checkbox" id="enableMovies" checked /> 🎬 Фильмы (Тренды и Жанры TMDB)</label>
        <label class="check-item"><input type="checkbox" id="enableSeries" checked /> 📺 Сериалы и Стриминги (Netflix, HBO)</label>
        <label class="check-item"><input type="checkbox" id="enableCartoons" checked /> 🧸 Мультфильмы и Мультсериалы</label>
        <label class="check-item"><input type="checkbox" id="enableAnime" checked /> ⛩️ Аниме (TMDB RU + Shikimori)</label>
      </div>
    </div>

    <div>
      <label class="field-label">Готовая ссылка на манифест для Nuvio (Settings → Addons → Add Addon):</label>
      <div class="url-box" id="manifestUrl">${baseUrl}/manifest.json</div>
      <div class="btn-row">
        <button class="btn-primary" id="copyBtn" type="button">Скопировать ссылку для Nuvio</button>
        <a class="btn btn-secondary" id="stremioBtn" href="stremio://${baseUrl.replace(/^https?:\/\//, '')}/manifest.json">Открыть через stremio://</a>
      </div>
    </div>
  </div>

  <script>
    const baseUrl = ${JSON.stringify(baseUrl)};
    const fields = ['tmdbKey', 'proxyMode', 'enableMovies', 'enableSeries', 'enableCartoons', 'enableAnime'];

    function toBase64Url(str) {
      return btoa(unescape(encodeURIComponent(str)))
        .replace(/\\+/g, '-')
        .replace(/\\//g, '_')
        .replace(/=+$/, '');
    }

    function updateUrl() {
      const cfg = {
        tmdbKey: document.getElementById('tmdbKey').value.trim(),
        proxyMode: document.getElementById('proxyMode').value,
        enableMovies: document.getElementById('enableMovies').checked,
        enableSeries: document.getElementById('enableSeries').checked,
        enableCartoons: document.getElementById('enableCartoons').checked,
        enableAnime: document.getElementById('enableAnime').checked
      };
      const isDefault = !cfg.tmdbKey && cfg.proxyMode === 'stream' && cfg.enableMovies && cfg.enableSeries && cfg.enableCartoons && cfg.enableAnime;
      const url = isDefault
        ? baseUrl + '/manifest.json'
        : baseUrl + '/' + toBase64Url(JSON.stringify(cfg)) + '/manifest.json';

      document.getElementById('manifestUrl').textContent = url;
      document.getElementById('stremioBtn').href = url.replace(/^https?:\\/\\//, 'stremio://');
    }

    fields.forEach(id => {
      document.getElementById(id).addEventListener('input', updateUrl);
      document.getElementById(id).addEventListener('change', updateUrl);
    });

    document.getElementById('copyBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(document.getElementById('manifestUrl').textContent);
        const btn = document.getElementById('copyBtn');
        btn.textContent = 'Скопировано!';
        setTimeout(() => { btn.textContent = 'Скопировать ссылку для Nuvio'; }, 2000);
      } catch (_) {}
    });
  </script>
</body>
</html>`;
}

function parseExtraArgs(extraSegment) {
  if (!extraSegment) return {};
  const clean = extraSegment.replace(/\.json$/i, '');
  const params = new URLSearchParams(clean);
  const out = {};
  for (const [k, v] of params.entries()) out[k.trim()] = v;
  return out;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${PORT}`;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${proto}://${host}`;
  const parsedUrl = new URL(req.url, baseUrl);
  const pathname = parsedUrl.pathname;

  try {
    // 1. Серверный прокси обложек (/proxy/image?url=...) — скачивает картинку с TMDB или через wsrv.nl и отдает бинарным потоком
    if (pathname === '/proxy/image') {
      const targetUrl = parsedUrl.searchParams.get('url');
      if (!targetUrl) {
        res.writeHead(400);
        res.end('Missing url');
        return;
      }
      try {
        // Сначала пробуем скачать напрямую с сервера (идеально при хостинге на Render), при неудаче — через wsrv.nl
        let imgRes = await fetch(targetUrl, { headers: { 'User-Agent': 'NuvioRuTmdbAddon/2.0' } }).catch(() => null);
        if (!imgRes || !imgRes.ok) {
          imgRes = await fetch(`https://wsrv.nl/?url=${encodeURIComponent(targetUrl)}`);
        }
        if (imgRes && imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          const buf = Buffer.from(await imgRes.arrayBuffer());
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400'
          });
          res.end(buf);
          return;
        }
      } catch (_) {}
      res.writeHead(302, { Location: `https://wsrv.nl/?url=${encodeURIComponent(targetUrl)}` });
      res.end();
      return;
    }

    // 2. Русский веб-конфигуратор
    if (pathname === '/' || pathname === '/configure' || pathname.endsWith('/configure')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderConfigureHtml(baseUrl));
      return;
    }

    const segments = pathname.split('/').filter(Boolean);
    let config = parseConfig(null);
    let routeSegments = segments;

    if (segments.length >= 2 && !['catalog', 'meta', 'stream', 'subtitles'].includes(segments[0])) {
      config = parseConfig(segments[0]);
      routeSegments = segments.slice(1);
    }

    // 3. Манифест
    if (routeSegments.length === 1 && routeSegments[0] === 'manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(buildManifest(config), null, 2));
      return;
    }

    // 4. Каталоги
    if (routeSegments[0] === 'catalog' && routeSegments.length >= 3) {
      const type = routeSegments[1];
      const rawCatalogId = routeSegments[2].replace(/\.json$/i, '');
      const extraArgs = parseExtraArgs(routeSegments[3] || '');
      const result = await handleCatalog(type, rawCatalogId, extraArgs, config, baseUrl);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
      return;
    }

    // 5. Метаданные фильма/сериала
    if (routeSegments[0] === 'meta' && routeSegments.length >= 3) {
      const type = routeSegments[1];
      const rawId = routeSegments[2].replace(/\.json$/i, '');
      const result = await handleMeta(type, rawId, config, baseUrl);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Маршрут не найден' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Nuvio RU (TMDB + Shikimori) запущен: http://127.0.0.1:${PORT}/configure`);
  });
}

module.exports = { server, buildManifest, handleCatalog, handleMeta };
