/**
 * The Trailer Database — Cloudflare D1 SQL API
 *
 * Query the full trailer database via URL:
 *   GET /query?sql=SELECT title, view_count FROM trailers ORDER BY view_count DESC LIMIT 10
 *
 * Returns JSON. Read-only (SELECT only). Free and open.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers for cross-origin access
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Root — show help
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(JSON.stringify({
        name: "The Trailer Database API",
        description: "Query 290,000+ movie trailers via SQL",
        usage: "GET /query?sql=SELECT ... FROM trailers ...",
        tables: ["movies", "trailers", "genres", "series"],
        examples: [
          "/query?sql=SELECT title, year, imdb_rating FROM movies ORDER BY imdb_votes DESC LIMIT 10",
          "/query?sql=SELECT m.title, t.title as trailer, t.view_count FROM trailers t JOIN movies m ON m.id = t.movie_id ORDER BY t.view_count DESC LIMIT 10",
          "/query?sql=SELECT language, COUNT(*) as cnt FROM trailers GROUP BY language ORDER BY cnt DESC",
          "/query?sql=SELECT trailer_type, AVG(view_count) as avg_views FROM trailers GROUP BY trailer_type ORDER BY avg_views DESC",
        ],
        schema: {
          movies: "id, imdb_id, tmdb_id, title, year, imdb_rating, imdb_votes, runtime, overview, poster_path, original_language",
          trailers: "id, movie_id, youtube_id, title, trailer_type, language, view_count, like_count, duration_seconds, channel_name, published_at",
          genres: "id, name",
          series: "id, tmdb_id, name, first_air_date, overview, poster_path, vote_average, vote_count, number_of_seasons, status",
        },
        note: "Read-only. SELECT queries only. Data from TMDB + YouTube.",
      }, null, 2), { headers: corsHeaders });
    }

    // Query endpoint
    if (url.pathname === "/query") {
      const sql = url.searchParams.get("sql");

      if (!sql) {
        return new Response(JSON.stringify({ error: "Missing ?sql= parameter" }), {
          status: 400, headers: corsHeaders
        });
      }

      // Security: only allow SELECT
      const trimmed = sql.trim().toUpperCase();
      if (!trimmed.startsWith("SELECT")) {
        return new Response(JSON.stringify({ error: "Only SELECT queries are allowed" }), {
          status: 403, headers: corsHeaders
        });
      }

      // Block dangerous keywords
      const blocked = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "ATTACH", "DETACH"];
      for (const keyword of blocked) {
        if (trimmed.includes(keyword)) {
          return new Response(JSON.stringify({ error: `${keyword} is not allowed` }), {
            status: 403, headers: corsHeaders
          });
        }
      }

      try {
        const result = await env.DB.prepare(sql).all();
        return new Response(JSON.stringify({
          success: true,
          columns: result.results.length > 0 ? Object.keys(result.results[0]) : [],
          rows: result.results,
          count: result.results.length,
          meta: result.meta,
        }, null, 2), { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({
          error: e.message,
          hint: "Check your SQL syntax. Use /query?sql=SELECT ... FROM trailers ..."
        }), {
          status: 400, headers: corsHeaders
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found. Try / for help or /query?sql=..." }), {
      status: 404, headers: corsHeaders
    });
  },
};
