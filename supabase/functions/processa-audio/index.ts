// Edge Function: rep l'audio, el transcriu amb Groq, n'extreu els productes
// amb un LLM de Groq i els desa a la taula "productes".
// Secrets necessaris: GROQ_API_KEY, ACCESS_CODE
// (SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY ja els injecta Supabase).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-access-code, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELS_LLM = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];

function resposta(cos: unknown, codi = 200) {
  return new Response(JSON.stringify(cos), {
    status: codi,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

function igual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function triaModel(groqKey: string): Promise<string> {
  const r = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${groqKey}` },
  });
  if (!r.ok) throw new Error(`Groq (models) ${r.status}: ${await r.text()}`);
  const disponibles: string[] = ((await r.json()).data ?? []).map((m: { id: string }) => m.id);
  const model = MODELS_LLM.find((m) => disponibles.includes(m));
  if (!model) throw new Error("Cap model de text disponible: " + disponibles.join(", "));
  return model;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta({ success: false, message: "Metode no permes" }, 405);

  try {
    const codiEsperat = Deno.env.get("ACCESS_CODE") ?? "";
    const codiRebut = req.headers.get("x-access-code") ?? "";
    if (!codiEsperat || !igual(codiRebut, codiEsperat)) {
      return resposta({ success: false, message: "Codi d'accés incorrecte" }, 401);
    }

    const form = await req.formData();
    const audio = form.get("audio");
    const tipus = String(form.get("tipus") ?? "");
    if (!(audio instanceof File)) return resposta({ success: false, message: "Falta l'àudio" }, 400);
    if (!["compra", "traster"].includes(tipus)) return resposta({ success: false, message: "Tipus no vàlid" }, 400);
    if (audio.size > 10 * 1024 * 1024) return resposta({ success: false, message: "Àudio massa gran" }, 400);

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) throw new Error("Falta el secret GROQ_API_KEY");

    // 1) Transcripció
    const stt = new FormData();
    stt.append("file", audio, audio.name || "audio.webm");
    stt.append("model", "whisper-large-v3-turbo");
    stt.append("language", "ca");
    stt.append("prompt", "Llista de la compra en català: llet, pa, ous, pomes, formatge, llaunes de tomàquet.");
    stt.append("response_format", "json");
    const r1 = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: stt,
    });
    if (!r1.ok) throw new Error(`Groq (transcripció) ${r1.status}: ${await r1.text()}`);
    const transcripcio = String((await r1.json()).text ?? "").trim();
    if (!transcripcio) return resposta({ success: true, transcripcio: "", productes: [] });

    // 2) Extracció de productes
    const model = await triaModel(groqKey);
    const r2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Extreus productes d'una transcripció parlada en català. " +
              'Respon NOMÉS amb JSON: {"productes":["producte 1","producte 2"]}. ' +
              "Escriu sempre els noms dels productes en català (tradueix-los si cal). " +
              'Cada producte en minúscules; inclou la quantitat si es diu (ex: "2 litres de llet"). ' +
              "Ignora paraules que no siguin productes. Si no n'hi ha cap, retorna {\"productes\":[]}.",
          },
          { role: "user", content: transcripcio },
        ],
      }),
    });
    if (!r2.ok) throw new Error(`Groq (LLM) ${r2.status}: ${await r2.text()}`);
    const llm = await r2.json();
    const contingut = JSON.parse(llm.choices?.[0]?.message?.content ?? "{}");
    const productes: string[] = (contingut.productes ?? [])
      .map((p: unknown) => String(p).trim())
      .filter(Boolean);

    // 3) Desar (la data la posa la BD amb default now())
    if (productes.length) {
      const clau = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const r3 = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/productes`, {
        method: "POST",
        headers: {
          apikey: clau,
          Authorization: `Bearer ${clau}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(productes.map((nom) => ({ nom, tipus, fet: false }))),
      });
      if (!r3.ok) throw new Error(`Supabase ${r3.status}: ${await r3.text()}`);
    }

    return resposta({ success: true, transcripcio, productes });
  } catch (e) {
    return resposta({ success: false, message: (e as Error).message }, 500);
  }
});
