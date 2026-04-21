/**
 * Prompt templates + context-aware question generators for the AI Ask panel.
 *
 * Users pick (or type) a question, then open it in Claude or ChatGPT.
 * The launched prompt primes the model to query TrailerDB's public SQL API.
 */

export const DB_API_URL = 'https://trailerdb.mhadifilms.workers.dev/query'

export const PROMPT_PREAMBLE = `You have access to The Trailer Database — a public, read-only SQL API with data on 336K+ movies, 24K+ TV series, and 290K+ trailers aggregated from TMDB and YouTube.

## How to query

GET ${DB_API_URL}?sql=<URL-ENCODED_SELECT_STATEMENT>

- Only SELECT is allowed.
- Response: {success, columns, rows, count, meta}
- Always LIMIT large queries (e.g. LIMIT 50) — don't pull millions of rows.
- URL-encode the SQL (spaces → %20, quotes → %27, etc.)

## Schema (key tables)

movies(id, imdb_id, tmdb_id, title, original_title, year, imdb_rating, imdb_votes, tmdb_popularity, runtime, original_language, release_date, overview, poster_path)

series(id, tmdb_id, name, original_name, first_air_date, number_of_seasons, overview, poster_path, vote_average, vote_count, popularity, original_language, status)

trailers(id, movie_id, youtube_id, title, trailer_type, language, region, is_official, view_count, like_count, comment_count, duration_seconds, channel_name, channel_id, published_at, is_embeddable, is_age_restricted, caption_available, description, tags, thumbnail_url)
  trailer_type ∈ {trailer, teaser, clip, behind_the_scenes, featurette, tv_spot, red_band, imax, bloopers, opening_credits}

series_trailers(id, series_id, youtube_id, title, trailer_type, language, region, is_official, view_count, like_count, duration_seconds, channel_name, published_at, season_number)

trailer_subtitles(movie_id, youtube_id, language, is_auto_generated)
trailer_audio_tracks(movie_id, youtube_id, language, is_original, is_auto_dubbed, display_name)
trailer_formats(movie_id, youtube_id, format_id, height, width, vcodec, acodec, fps, filesize)
trailer_availability(movie_id, youtube_id, country_code)    -- where the video is geo-available
trailer_metadata(movie_id, youtube_id, category, upload_date, publish_date, is_family_safe, is_unlisted, available_country_count, has_chapters, length_seconds, view_count_snapshot, fetch_status)

trailer_comments(youtube_id, author, text, like_count, reply_count, published_at, is_top_level, sentiment)
  sentiment ∈ {positive, neutral, negative} (NULL if not yet analyzed)

genres(id, name)
movie_genres(movie_id, genre_id)
series_genres(series_id, genre_id)

## Useful joins

- Movie trailers with genre: trailers t JOIN movies m ON m.id=t.movie_id JOIN movie_genres mg ON mg.movie_id=m.id JOIN genres g ON g.id=mg.genre_id
- Engagement rate: like_count * 1.0 / view_count
- Multilingual reach for a movie: SELECT DISTINCT language FROM trailers WHERE movie_id=?
- Sentiment breakdown: SELECT sentiment, COUNT(*) FROM trailer_comments WHERE youtube_id=? GROUP BY sentiment
`

export const PROMPT_TASK = `## Your task

Answer the following question using the database above. Plan your SQL, run it by fetching the URL, and summarize the findings with concrete numbers. If the first query returns nothing useful, refine it — don't guess.

Question:`

export type QuestionContext =
  | { kind: 'dashboard' }
  | { kind: 'movie'; imdbId: string; title: string; year?: number | null }
  | { kind: 'series'; tmdbId: string; name: string }
  | { kind: 'explore' }
  | { kind: 'compare' }

export interface SuggestedQuestion {
  label: string
  prompt: string
}

export function suggestedQuestions(ctx: QuestionContext): SuggestedQuestion[] {
  switch (ctx.kind) {
    case 'movie': {
      const t = ctx.title
      return [
        {
          label: `How much positive engagement did the trailer for ${t} get?`,
          prompt: `How much positive engagement did the trailer for "${t}" get? Look at its comment sentiment breakdown, and compare its like-to-view ratio against similar-era films.`,
        },
        {
          label: `Which languages was ${t} dubbed or subtitled into?`,
          prompt: `Which languages is the trailer for "${t}" dubbed or subtitled into? Show both the original-audio trailers and their localized dubs/captions.`,
        },
        {
          label: `How does ${t} compare to its genre peers?`,
          prompt: `How does the trailer performance for "${t}" compare to other films in the same genre and release decade? Look at view counts, engagement rate, and trailer count.`,
        },
        {
          label: `Where is the ${t} trailer geo-blocked?`,
          prompt: `For the trailer(s) for "${t}", identify which countries the video is NOT available in (trailer_availability has country codes where it IS available — compare against the full country list to find blocked regions).`,
        },
        {
          label: `What's the most-commented trailer for ${t}?`,
          prompt: `Which trailer for "${t}" has the most comments, and what's the top comment sentiment in each language? Include the YouTube link.`,
        },
      ]
    }
    case 'series': {
      const n = ctx.name
      return [
        {
          label: `Out of all ${n} trailers, which had the most negative sentiment?`,
          prompt: `Out of all trailers for the series "${n}" (including per-language versions), which ones stood out as having the most negative sentiment in their comment sections?`,
        },
        {
          label: `How did trailer engagement evolve across ${n} seasons?`,
          prompt: `How did trailer view counts, like-to-view ratios, and comment sentiment evolve across seasons of "${n}"? Bucket by season_number.`,
        },
        {
          label: `Which ${n} trailer had the widest international reach?`,
          prompt: `Which trailer for "${n}" has the most distinct language versions (dubs + subtitles combined) and the most countries available?`,
        },
        {
          label: `What's the most-viewed trailer type for ${n}?`,
          prompt: `Across all the trailers for the series "${n}", which trailer_type (trailer, teaser, clip, featurette, etc.) accumulated the most total views?`,
        },
      ]
    }
    case 'compare':
      return [
        {
          label: 'Which of the compared items has the highest engagement rate?',
          prompt: 'For the items the user is comparing in /analytics, compute the like-to-view engagement rate of each and tell them which wins, including the absolute gap.',
        },
        {
          label: 'Which one has the broadest international distribution?',
          prompt: 'For each compared item, count distinct languages across its trailers + the number of countries those trailers are available in. Which has the widest global footprint?',
        },
        {
          label: 'Which one gets the most positive comment sentiment?',
          prompt: 'Compare comment sentiment (positive/neutral/negative breakdown from trailer_comments) across the compared items. Which has the most favorable audience reaction?',
        },
      ]
    case 'explore':
      return [
        {
          label: 'What query would answer: "Do horror trailers get shorter every year?"',
          prompt: 'Write a SQL query that groups horror-genre trailers by release decade and shows avg duration_seconds per decade. Then run it and interpret the trend.',
        },
        {
          label: 'Show me the anomalies — trailers with 100x more likes than peers',
          prompt: 'Find trailers whose like-to-view ratio is >10x their trailer_type average. Show title, movie, ratio, and the YouTube link. LIMIT 20.',
        },
        {
          label: 'Translate my current filters into plain-English insights',
          prompt: "I'm exploring the database with custom filters — can you suggest 3 follow-up questions that would deepen the analysis based on common patterns (e.g. sentiment, geo, engagement, per-language comparisons)?",
        },
      ]
    case 'dashboard':
    default:
      return [
        {
          label: "What's the optimal trailer length for the most positive engagement?",
          prompt: "What's the optimal trailer length to maximize positive engagement? Bucket trailers by duration_seconds (e.g. 0–30s, 30–60s, 1–2min, 2–3min, 3+min) and compare average like-to-view ratio and positive-sentiment share per bucket.",
        },
        {
          label: 'Which trailer type gets the most views on average?',
          prompt: "Which trailer_type (trailer vs teaser vs clip vs tv_spot vs featurette, etc.) has the highest average view_count? Also show median to guard against outliers.",
        },
        {
          label: 'Which language has the highest per-trailer engagement?',
          prompt: 'For each language in the trailers table, compute the average like-to-view engagement rate and total views. Which languages punch above their weight (high engagement despite lower total views)?',
        },
        {
          label: 'What channel dominates the trailer ecosystem?',
          prompt: 'Which YouTube channel has uploaded the most views-per-upload on average for movie trailers? Show top 10 with total views, upload count, and avg views/upload.',
        },
        {
          label: 'Do earlier trailers get more hype than late-stage drops?',
          prompt: 'Does a trailer released closer to its movie\'s release_date (short days_before_release) or well in advance get more views? Bucket by proximity to release and compare engagement.',
        },
        {
          label: 'Which countries have the most restricted trailer availability?',
          prompt: 'Using trailer_availability, find the countries that appear least often (i.e. most commonly blocked from watching movie trailers). Rank and explain any geographic patterns.',
        },
      ]
  }
}

export function buildFullPrompt(question: string): string {
  return `${PROMPT_PREAMBLE}\n${PROMPT_TASK} ${question.trim()}`
}

export function claudeUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
}

export function chatgptUrl(prompt: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`
}
