export default {
  async fetch(request, env, ctx) {
    return new Response("Brazil 2D is working! 🇧🇷", {
      headers: {
        "Content-Type": "text/plain; charset=UTF-8",
      },
    });
  },
};
