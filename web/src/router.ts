import { createRouter, createWebHistory } from "vue-router";
import SessionsHome from "@/views/SessionsHome.vue";
import SessionDetail from "@/views/SessionDetail.vue";
import Events from "@/views/Events.vue";
import Projects from "@/views/Projects.vue";
import Config from "@/views/Config.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: SessionsHome },
    { path: "/sessions/:id", component: SessionDetail },
    { path: "/events", component: Events },
    { path: "/projects", component: Projects },
    { path: "/config", component: Config },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
