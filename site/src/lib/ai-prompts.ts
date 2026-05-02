/**
 * Prompt templates + context-aware question generators for the AI Ask panel.
 *
 * The flow:
 *   1. User picks (or writes) a question.
 *   2. If the question has an associated SQL query, the panel pre-executes it
 *      against the public TrailerDB worker (CORS works fine from our origin),
 *      gets JSON, and embeds it in the prompt under a ## Data section.
 *   3. The opened AI (Claude / ChatGPT) sees question + data and can analyze
 *      without needing to fetch anything (their web_fetch tools only allow
 *      user-typed URLs, so an embedded URL would be refused).
 *   4. Custom user-typed questions ship without inline data — the prompt asks
 *      the AI to propose a SQL query the user can run themselves.
 */

export const DB_API_URL = 'https://trailerdb.mhadifilms.workers.dev/query'

export const PROMPT_PREAMBLE_WITH_DATA = `You are answering a question about The Trailer Database — a public dataset of 336K+ movies, 24K+ TV series, and 290K+ trailers from TMDB + YouTube.

The relevant query results have already been fetched for you and are inlined under \`## Data\` below. Read the JSON, interpret the columns, and answer the question with concrete numbers and a clear narrative.

If the data is insufficient or you'd want to see something more, name the SQL query you'd want next and ask the user to paste back the results — the public SQL endpoint is ${DB_API_URL}?sql=<URL-encoded SELECT…>.`

export const PROMPT_PREAMBLE_NO_DATA = `You are answering a question about The Trailer Database — a public dataset of 336K+ movies, 24K+ TV series, and 290K+ trailers from TMDB + YouTube.

There is no live data fetched for this question. To answer, you'll need the user to run a SQL query.

**How:** propose a single SELECT query (be specific — pick exact columns and a sensible LIMIT). Print the full URL: \`${DB_API_URL}?sql=<URL-encoded SQL>\`. Ask the user to open it and paste the JSON back. Then analyze.

Don't try to call the URL yourself with web_fetch or curl — Claude/ChatGPT environments block both for non-user-typed URLs and for hosts not on their allowlist.

## Schema (key tables)

movies(id, imdb_id, tmdb_id, title, original_title, year, imdb_rating, imdb_votes, tmdb_popularity, runtime, original_language, release_date, overview, poster_path)
series(id, tmdb_id, name, original_name, first_air_date, number_of_seasons, overview, vote_average, vote_count, popularity, original_language, status)
trailers(id, movie_id, youtube_id, title, trailer_type, language, region, is_official, view_count, like_count, comment_count, duration_seconds, channel_name, channel_id, published_at, description, tags, thumbnail_url, is_embeddable, is_age_restricted, caption_available)
  trailer_type ∈ {trailer, teaser, clip, behind_the_scenes, featurette, tv_spot, red_band, imax, bloopers, opening_credits}
series_trailers(id, series_id, youtube_id, title, trailer_type, language, view_count, like_count, duration_seconds, channel_name, published_at, season_number)
trailer_subtitles(movie_id, youtube_id, language, is_auto_generated)
trailer_audio_tracks(movie_id, youtube_id, language, is_original, is_auto_dubbed, display_name)
trailer_availability(movie_id, youtube_id, country_code)
trailer_metadata(movie_id, youtube_id, category, upload_date, available_country_count, has_chapters, length_seconds, view_count_snapshot, fetch_status)
trailer_comments(youtube_id, author, text, like_count, published_at, sentiment)  -- sentiment ∈ {positive, neutral, negative} when analyzed
genres(id, name), movie_genres(movie_id, genre_id), series_genres(series_id, genre_id)
`

export type QuestionContext =
  | { kind: 'dashboard' }
  | { kind: 'movie'; imdbId: string; title: string; year?: number | null }
  | { kind: 'series'; tmdbId: string; name: string }
  | { kind: 'explore' }
  | { kind: 'compare' }

export interface SuggestedQuestion {
  label: string
  prompt: string
  /** Optional SQL — if set, the panel runs it before opening Claude/ChatGPT and inlines results. */
  sql?: string
}

function escSql(v: string): string {
  return v.replace(/'/g, "''")
}

export function suggestedQuestions(ctx: QuestionContext): SuggestedQuestion[] {
  switch (ctx.kind) {
    case 'movie': {
      const t = ctx.title
      const tEsc = escSql(t)
      return [
        {
          label: `How much engagement did the ${t} trailer get?`,
          prompt: `How much engagement did the trailer(s) for "${t}" get? Look at view counts, like counts, and the like-to-view ratio. Compare against trailers for similar-era films in the same genre.`,
          sql: `SELECT t.title AS trailer, t.trailer_type, t.language, t.view_count, t.like_count, t.comment_count, t.duration_seconds, t.published_at, ROUND(t.like_count*1.0/NULLIF(t.view_count,0), 5) AS like_view_ratio, t.youtube_id FROM trailers t JOIN movies m ON m.id=t.movie_id WHERE m.title='${tEsc}' ORDER BY t.view_count DESC LIMIT 30`,
        },
        {
          label: `Which languages was ${t} dubbed/subtitled into?`,
          prompt: `Which languages is the trailer for "${t}" dubbed or subtitled into? Distinguish between manual subtitle tracks, auto-generated captions, and dubbed audio tracks.`,
          sql: `SELECT 'subtitle' AS kind, ts.language, MAX(ts.is_auto_generated) AS is_auto FROM trailer_subtitles ts JOIN trailers t ON t.youtube_id=ts.youtube_id JOIN movies m ON m.id=t.movie_id WHERE m.title='${tEsc}' GROUP BY ts.language UNION ALL SELECT 'audio' AS kind, ta.language, ta.is_auto_dubbed FROM trailer_audio_tracks ta JOIN trailers t ON t.youtube_id=ta.youtube_id JOIN movies m ON m.id=t.movie_id WHERE m.title='${tEsc}' LIMIT 100`,
        },
        {
          label: `How does ${t} compare to its genre peers?`,
          prompt: `How does the trailer performance for "${t}" compare to other films in its genre and decade? Look at avg view counts, avg engagement, and trailer count per movie.`,
          sql: `WITH target AS (SELECT m.id AS mid, m.year AS yr FROM movies m WHERE m.title='${tEsc}' LIMIT 1) SELECT 'this_movie' AS scope, m.title, COUNT(t.id) AS trailers, ROUND(AVG(t.view_count),0) AS avg_views, ROUND(AVG(t.like_count*1.0/NULLIF(t.view_count,0)),5) AS avg_like_ratio FROM movies m JOIN trailers t ON t.movie_id=m.id WHERE m.id=(SELECT mid FROM target) GROUP BY m.title UNION ALL SELECT 'genre_peers' AS scope, g.name AS title, COUNT(t.id) AS trailers, ROUND(AVG(t.view_count),0) AS avg_views, ROUND(AVG(t.like_count*1.0/NULLIF(t.view_count,0)),5) AS avg_like_ratio FROM movies m JOIN movie_genres mg ON mg.movie_id=m.id JOIN genres g ON g.id=mg.genre_id JOIN trailers t ON t.movie_id=m.id WHERE m.year BETWEEN (SELECT yr-2 FROM target) AND (SELECT yr+2 FROM target) AND mg.genre_id IN (SELECT mg2.genre_id FROM movie_genres mg2 WHERE mg2.movie_id=(SELECT mid FROM target)) GROUP BY g.name LIMIT 20`,
        },
        {
          label: `Where is the ${t} trailer geo-blocked?`,
          prompt: `For trailers of "${t}", which countries is the video NOT available in? The trailer_availability table lists countries where it IS available — note any that are missing from the standard ~250 country set, especially major markets.`,
          sql: `SELECT t.youtube_id, t.title, COUNT(DISTINCT av.country_code) AS countries_available, GROUP_CONCAT(av.country_code) AS country_list FROM trailers t JOIN movies m ON m.id=t.movie_id LEFT JOIN trailer_availability av ON av.youtube_id=t.youtube_id WHERE m.title='${tEsc}' GROUP BY t.youtube_id, t.title ORDER BY countries_available LIMIT 10`,
        },
        {
          label: `What's in the comments for ${t}?`,
          prompt: `What does audience reaction look like for "${t}" trailers based on YouTube comments? Show top-liked comments and any sentiment breakdown.`,
          sql: `SELECT tc.author, tc.text, tc.like_count, tc.sentiment, tc.published_at, t.title AS trailer FROM trailer_comments tc JOIN trailers t ON t.youtube_id=tc.youtube_id JOIN movies m ON m.id=t.movie_id WHERE m.title='${tEsc}' ORDER BY tc.like_count DESC LIMIT 20`,
        },
      ]
    }
    case 'series': {
      const n = ctx.name
      const nEsc = escSql(n)
      return [
        {
          label: `Which ${n} trailer had the most negative sentiment?`,
          prompt: `Out of all trailers for the series "${n}", which ones had the most negative comment sentiment? Identify the trailer, its language, and what audiences seemed to react to.`,
          sql: `SELECT t.title AS trailer, t.language, t.season_number, COUNT(CASE WHEN tc.sentiment='negative' THEN 1 END) AS negative, COUNT(CASE WHEN tc.sentiment='positive' THEN 1 END) AS positive, COUNT(*) AS total FROM series_trailers t JOIN series s ON s.id=t.series_id JOIN trailer_comments tc ON tc.youtube_id=t.youtube_id WHERE s.name='${nEsc}' GROUP BY t.id ORDER BY negative*1.0/NULLIF(total,0) DESC LIMIT 15`,
        },
        {
          label: `How did ${n} engagement evolve across seasons?`,
          prompt: `How did trailer view counts and engagement evolve across seasons of "${n}"? Bucket by season_number.`,
          sql: `SELECT t.season_number, COUNT(t.id) AS trailers, ROUND(AVG(t.view_count),0) AS avg_views, ROUND(AVG(t.like_count*1.0/NULLIF(t.view_count,0)),5) AS avg_like_ratio FROM series_trailers t JOIN series s ON s.id=t.series_id WHERE s.name='${nEsc}' GROUP BY t.season_number ORDER BY t.season_number LIMIT 30`,
        },
        {
          label: `Which ${n} trailer had the widest international reach?`,
          prompt: `Which trailer for "${n}" reached the most distinct languages (dubbed audio + manual subtitle tracks)?`,
          sql: `SELECT t.title AS trailer, t.season_number, COUNT(DISTINCT t.language) AS native_langs FROM series_trailers t JOIN series s ON s.id=t.series_id WHERE s.name='${nEsc}' GROUP BY t.id ORDER BY native_langs DESC LIMIT 15`,
        },
      ]
    }
    case 'compare':
      return [
        {
          label: 'Which compared item has the highest engagement rate?',
          prompt: 'Compare the engagement (like-to-view ratio) of the items the user is comparing. Walk through each one and identify the leader and the size of the gap.',
        },
        {
          label: 'Which has the broadest international distribution?',
          prompt: 'For each compared item, how many distinct languages do its trailers cover, and how many countries are they available in? Rank them on global footprint.',
        },
      ]
    case 'explore':
      return [
        {
          label: 'Show trailers that punch way above their weight on engagement',
          prompt: 'Find trailers whose like-to-view ratio is more than 5x the median for their trailer_type. List title, movie, ratio, and the YouTube link.',
          sql: `WITH typed_med AS (SELECT trailer_type, AVG(like_count*1.0/NULLIF(view_count,0)) AS med FROM trailers WHERE view_count > 10000 GROUP BY trailer_type) SELECT m.title AS movie, t.title AS trailer, t.trailer_type, t.view_count, ROUND(t.like_count*1.0/NULLIF(t.view_count,0),5) AS ratio, t.youtube_id FROM trailers t JOIN typed_med tm ON tm.trailer_type=t.trailer_type JOIN movies m ON m.id=t.movie_id WHERE t.view_count > 100000 AND t.like_count*1.0/NULLIF(t.view_count,0) > tm.med * 5 ORDER BY ratio DESC LIMIT 25`,
        },
        {
          label: 'Do horror trailers get shorter every year?',
          prompt: 'Bucket horror-genre trailers by release decade and show the average duration_seconds per decade. Interpret the trend.',
          sql: `SELECT (m.year/10)*10 AS decade, COUNT(t.id) AS trailers, ROUND(AVG(t.duration_seconds),0) AS avg_seconds FROM trailers t JOIN movies m ON m.id=t.movie_id JOIN movie_genres mg ON mg.movie_id=m.id JOIN genres g ON g.id=mg.genre_id WHERE g.name='Horror' AND t.duration_seconds IS NOT NULL AND m.year IS NOT NULL GROUP BY decade ORDER BY decade LIMIT 30`,
        },
      ]
    case 'dashboard':
    default:
      return [
        {
          label: "What's the optimal trailer length for engagement?",
          prompt: "What's the optimal trailer length to maximize engagement? Look at average like-to-view ratio across duration buckets and tell me the sweet spot.",
          sql: `SELECT CASE WHEN duration_seconds<=30 THEN '01: 0-30s' WHEN duration_seconds<=60 THEN '02: 30-60s' WHEN duration_seconds<=120 THEN '03: 1-2min' WHEN duration_seconds<=180 THEN '04: 2-3min' ELSE '05: 3+min' END AS bucket, COUNT(*) AS trailers, ROUND(AVG(like_count*1.0/NULLIF(view_count,0)),5) AS avg_like_ratio, ROUND(AVG(view_count),0) AS avg_views FROM trailers WHERE duration_seconds IS NOT NULL AND view_count > 1000 GROUP BY bucket ORDER BY bucket`,
        },
        {
          label: 'Which trailer type gets the most views on average?',
          prompt: 'Which trailer_type (trailer vs teaser vs clip vs tv_spot vs featurette) has the highest average view_count? Show median too to guard against outliers.',
          sql: `SELECT trailer_type, COUNT(*) AS n, ROUND(AVG(view_count),0) AS avg_views, ROUND(AVG(like_count),0) AS avg_likes FROM trailers WHERE view_count IS NOT NULL GROUP BY trailer_type ORDER BY avg_views DESC LIMIT 20`,
        },
        {
          label: 'Which language has the highest per-trailer engagement?',
          prompt: 'For each trailer language, compute average engagement rate and total views. Which languages punch above their weight?',
          sql: `SELECT language, COUNT(*) AS trailers, ROUND(AVG(view_count),0) AS avg_views, SUM(view_count) AS total_views, ROUND(AVG(like_count*1.0/NULLIF(view_count,0)),5) AS avg_like_ratio FROM trailers WHERE language IS NOT NULL AND view_count > 0 GROUP BY language HAVING trailers > 50 ORDER BY avg_like_ratio DESC LIMIT 25`,
        },
        {
          label: 'What channel dominates the trailer ecosystem?',
          prompt: 'Which YouTube channels have uploaded the most movie trailers? Show top channels with total views, upload count, and average views per upload.',
          sql: `SELECT channel_name, COUNT(*) AS uploads, SUM(view_count) AS total_views, ROUND(AVG(view_count),0) AS avg_views_per_upload FROM trailers WHERE channel_name IS NOT NULL GROUP BY channel_name ORDER BY total_views DESC LIMIT 25`,
        },
        {
          label: 'Which countries have the most restricted trailer access?',
          prompt: 'Looking at trailer_availability, which country codes appear least often (i.e. most commonly geo-blocked)? Note any geographic patterns.',
          sql: `WITH total AS (SELECT COUNT(DISTINCT youtube_id) AS n FROM trailer_availability) SELECT country_code, COUNT(*) AS available_count, ROUND(COUNT(*)*100.0/(SELECT n FROM total),2) AS pct_of_videos FROM trailer_availability GROUP BY country_code ORDER BY available_count ASC LIMIT 25`,
        },
      ]
  }
}

export function buildPrompt(question: string, dataJson: string | null): string {
  if (dataJson) {
    return `${PROMPT_PREAMBLE_WITH_DATA}\n\n## Question\n\n${question.trim()}\n\n## Data\n\n\`\`\`json\n${dataJson}\n\`\`\`\n`
  }
  return `${PROMPT_PREAMBLE_NO_DATA}\n\n## Question\n\n${question.trim()}\n`
}

/** URL builder for the public SQL API. */
export function apiQueryUrl(sql: string): string {
  return `${DB_API_URL}?sql=${encodeURIComponent(sql)}`
}

export function claudeUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
}

export function chatgptUrl(prompt: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`
}
