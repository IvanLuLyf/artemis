import {createChat} from "./core/chat.ts"

Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === "/chat") {
        return await createChat(req);
    }
    const data = await Deno.readFile("./index.html");
    return new Response(new TextDecoder().decode(data), {
        headers: {
            "Content-Type": "text/html;charset=utf-8"
        },
    });
});