export interface MovieIndex {
  imdb_id: string
  title: string
  year: number | null
  rating: number | null
  votes: number | null
  poster: string | null
  genre_ids: number[]
  tmdb_id: number | null
  slug: string
  trailer_count: number
  popularity: number
}

export interface Trailer {
  youtube_id: string
  title: string | null
  type: TrailerType
  language: string | null
  region: string | null
  is_official: boolean
  published_at: string | null
  quality: number | null
  channel_name: string | null
  duration: number | null
  views: number | null
}

export interface TrailerGroupEntry {
  youtube_id: string
  title: string | null
}

export interface TrailerGroup {
  group_id: number
  type: TrailerType
  title: string | null
  languages: Record<string, TrailerGroupEntry>
}

export interface MovieDetail {
  imdb_id: string
  tmdb_id: number | null
  title: string
  original_title: string | null
  year: number | null
  imdb_rating: number | null
  imdb_votes: number | null
  runtime: number | null
  overview: string | null
  poster_path: string | null
  backdrop_path: string | null
  original_language: string | null
  genres: string[]
  slug: string
  trailers: Trailer[]
  trailer_groups?: TrailerGroup[]
}

export type TrailerType =
  | 'trailer'
  | 'teaser'
  | 'clip'
  | 'behind_the_scenes'
  | 'featurette'
  | 'bloopers'
  | 'tv_spot'
  | 'red_band'
  | 'imax'

export interface GenreMeta {
  id: number
  name: string
  slug: string
  count: number
}

export interface BrowseIndex {
  movies: (string | number | number[] | null)[][]
  fields: string[]
  genres: Record<string, string>
}

export interface SiteStats {
  movies_with_trailers: number
  total_trailers: number
  languages: number
  by_type: Record<string, number>
  by_language: Record<string, number>
  series_with_trailers?: number
  total_series_trailers?: number
  total_views?: number
  total_likes?: number
  avg_duration_seconds?: number
  unique_channels?: number
  top_channels?: { name: string; trailers: number; views: number }[]
  most_viewed?: { youtube_id: string; title: string; views: number; type: string; movie: string; imdb_id: string }[]
  duration_by_type?: Record<string, { avg_seconds: number; count: number }>
}

export interface SeriesIndex {
  tmdb_id: number
  name: string
  year: number | null
  rating: number | null
  votes: number | null
  poster: string | null
  genre_ids: number[]
  slug: string
  trailer_count: number
  popularity: number
}

export interface SeriesDetail {
  tmdb_id: number
  name: string
  original_name: string | null
  first_air_date: string | null
  overview: string | null
  poster_path: string | null
  backdrop_path: string | null
  status: string | null
  number_of_seasons: number | null
  vote_average: number | null
  vote_count: number | null
  original_language: string | null
  genres: string[]
  slug: string
  trailers: SeriesTrailer[]
}

export interface SeriesTrailer {
  youtube_id: string
  title: string | null
  trailer_type: TrailerType
  language: string | null
  region: string | null
  is_official: boolean
  published_at: string | null
  quality: number | null
}

export interface SeriesBrowseIndex {
  series: (string | number | number[] | null)[][]
  fields: string[]
  genres: Record<string, string>
}
