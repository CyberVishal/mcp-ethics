/* ======================================================
   MCP TOOLS — STABLE BASE (NO DUPLICATES)
   ====================================================== */

const GOOGLE_SLIDES_WEBAPP =
  "https://script.google.com/macros/s/AKfycbz4NLThJAGTGGafT4lrpakQYfuEf6939mAauaFRKfLcBFhjXCBAxLkRX5yIUEBr1x2b/exec";

/* ------------------------------------------------------
   Helper: POST JSON safely
------------------------------------------------------ */
async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Tool HTTP ${res.status}`);
  }

  return res.json();
}

/* ======================================================
   TOOLS EXPORT
   ====================================================== */
export const tools = {
  /* -----------------------------------------------
     CREATE GOOGLE SLIDES DECK (EMPTY)
  ----------------------------------------------- */
  generateSlides: async ({ topic }) => {
    const data = await postJSON(GOOGLE_SLIDES_WEBAPP, {
      title: topic || "MCP Presentation",
      slides: [],
    });

    return `Live deck created:\n${data.url}`;
  },

  /* -----------------------------------------------
     ADD ONE SLIDE (ATOMIC)
  ----------------------------------------------- */
  addSlide: async ({ title, bullets }) => {
    return postJSON(GOOGLE_SLIDES_WEBAPP, {
      append: true,
      slide: {
        title,
        bullets,
      },
    });
  },
};

