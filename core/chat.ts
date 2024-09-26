const CONFIG = {
    url: Deno.env.get("BUNNY_BASE_URL"),
    api_key: Deno.env.get("BUNNY_API_KEY"),
    model: Deno.env.get("BUNNY_MODEL"),
}

export async function createChat(req: Request) {
    const {content, messages: history = []} = await req.json();
    const messages = [
        ...history.slice(-6),
        {role: "user", content},
    ];
    const decoder = new TextDecoder("utf-8");
    const encoder = new TextEncoder();
    const ctx: { bufferText: string } = {bufferText: ""};
    return new Response(new ReadableStream({
        start(controller) {
            const parse = (line: string) => {
                try {
                    const tmp = JSON.parse(line);
                    const text = tmp?.choices?.[0]?.delta?.content || '';
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({text})}\n\n`));
                } catch (e) {
                }
            };
            const processLine = (x: string) => {
                if (x.startsWith("data:")) {
                    parse(x.substring(5).trim());
                } else if (x.startsWith("{")) {
                    parse(x);
                }
            };
            fetch(`${CONFIG.url}chat/completions`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${CONFIG.api_key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: CONFIG.model,
                    messages,
                    stream: true,
                }),
            }).then((res) => {
                const reader = res.body.getReader();
                const loop = () => {
                    reader.read().then((g) => {
                        if (g.done) {
                            if (ctx.bufferText) {
                                processLine(ctx.bufferText);
                            }
                            controller.close();
                            return;
                        }
                        ctx.bufferText += decoder.decode(g.value, {stream: true});
                        const lines = ctx.bufferText.split(/\r\n|\r|\n/);
                        ctx.bufferText = lines.pop();
                        lines.forEach((x) => processLine(x));
                        loop();
                    });
                };
                loop();
            });
        },
    }), {
        headers: {
            "Content-Type": "text/event-stream;charset=UTF-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    });
}