"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * El contenido se desplaza dentro de <main>, no en la ventana, así que el
 * navegador no recuerda dónde ibas al volver atrás (el gesto de deslizar en
 * celular). Aquí se guarda la posición de cada pantalla y se recupera solo
 * cuando se regresa con "atrás"; al entrar a una pantalla nueva se empieza
 * desde arriba.
 */
const KEY = "reymen-scroll:";

function main(): HTMLElement | null {
  return document.querySelector("main");
}

export function ScrollMemory() {
  const pathname = usePathname();
  const current = useRef(pathname);
  const popped = useRef(false);
  const restoring = useRef(false);

  useEffect(() => {
    const el = main();
    if (!el) return;
    const onPop = () => {
      popped.current = true;
    };
    const onScroll = () => {
      if (restoring.current) return;
      try {
        sessionStorage.setItem(KEY + current.current, String(el.scrollTop));
      } catch {
        /* sin almacenamiento: no se recuerda */
      }
    };
    window.addEventListener("popstate", onPop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("popstate", onPop);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const el = main();
    if (!el) return;
    const back = popped.current;
    popped.current = false;
    let saved = 0;
    if (back) {
      try {
        saved = Number(sessionStorage.getItem(KEY + pathname)) || 0;
      } catch {
        /* ignore */
      }
    }
    // Se fija la ruta nueva antes de mover el scroll para no pisar la anterior.
    current.current = pathname;
    restoring.current = false;
    if (saved <= 0) {
      el.scrollTop = 0;
      return;
    }
    // Espera cambios reales de tamaño mientras Suspense termina de renderizar.
    restoring.current = true;
    const content = el.firstElementChild;
    const stop = () => { restoring.current = false; observer?.disconnect(); mutations?.disconnect(); };
    const apply = () => {
      el.scrollTop = saved;
      if (Math.abs(el.scrollTop - saved) <= 2) stop();
    };
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    if (content) observer.observe(content);
    const mutations = new MutationObserver(apply);
    mutations.observe(el, { childList: true, subtree: true });
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("wheel", stop, { passive: true });
    apply();
    return () => { stop(); el.removeEventListener("touchstart", stop); el.removeEventListener("wheel", stop); };
  }, [pathname]);

  return null;
}
