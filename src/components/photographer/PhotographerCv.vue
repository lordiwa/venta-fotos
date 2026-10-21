<script setup lang="ts">
import { EDUCATION, EXPERIENCE, LANGUAGES, PORTFOLIO, TOOLS } from '../../photographerLogic'
</script>

<template>
  <section class="cv" aria-label="Trayectoria">
    <div>
      <h2 class="head">Experiencia</h2>
      <ol class="timeline">
        <li v-for="x in EXPERIENCE" :key="x.title" class="item">
          <span class="when">{{ x.when }}</span>
          <div>
            <h3 class="display-xs title">{{ x.title }}</h3>
            <p class="org">{{ x.org }}</p>
            <p class="text">{{ x.text }}</p>
          </div>
        </li>
      </ol>
    </div>
    <div class="side">
      <div>
        <h2 class="head">Formación</h2>
        <ol class="edu">
          <li v-for="x in EDUCATION" :key="x.title">
            <span class="when">{{ x.when }}</span>
            <h3 class="title-sm">{{ x.title }}</h3>
            <p class="org">{{ x.org }}</p>
          </li>
        </ol>
      </div>
      <div>
        <h2 class="head">Idiomas</h2>
        <dl class="langs">
          <div v-for="l in LANGUAGES" :key="l.name"><dt>{{ l.name }}</dt><dd>{{ l.level }}</dd></div>
        </dl>
      </div>
      <div>
        <h2 class="head">Especialidades</h2>
        <ul class="tags">
          <li v-for="c in PORTFOLIO" :key="c.id"><a :href="`#${c.id}`">{{ c.name }}</a></li>
        </ul>
      </div>
      <div>
        <h2 class="head">Herramientas</h2>
        <ul class="tags">
          <li v-for="t in TOOLS" :key="t"><span>{{ t }}</span></li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cv { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: var(--space-14); }
.side { display: flex; flex-direction: column; gap: var(--space-10); }
.head { display: flex; align-items: center; gap: var(--space-3); margin: 0 0 var(--space-6); font: 500 12px/1.3 var(--font-mono); letter-spacing: .18em; text-transform: uppercase; color: var(--ink-muted); }
.head::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.timeline, .edu { list-style: none; margin: 0; padding: 0; }
.timeline { display: flex; flex-direction: column; gap: var(--space-8); }
.item { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: var(--space-5); }
.when { font: 13px/1.4 var(--font-mono); color: var(--amber-ink); white-space: nowrap; padding-top: 3px; }
.title { margin: 0; }
.org { margin: 2px 0 0; font-size: 15px; color: var(--ink-muted); }
.text { margin: var(--space-2) 0 0; line-height: 1.55; max-width: 60ch; text-wrap: pretty; }
.edu { display: flex; flex-direction: column; gap: var(--space-5); }
.edu li { padding-left: var(--space-4); border-left: 2px solid var(--amber); }
.title-sm { margin: 2px 0 0; font-family: var(--font-display); font-size: 17px; font-weight: 700; letter-spacing: -.01em; line-height: 1.25; }
.langs { margin: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.langs div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-1) var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--line); }
.langs dt { font-weight: 600; }
.langs dd { margin: 0; color: var(--ink-muted); }
.tags { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
.tags a, .tags span { display: inline-flex; align-items: center; min-height: 36px; padding: 0 var(--space-4); border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: var(--surface-raised); font-size: 14px; color: var(--ink); text-decoration: none; }
.tags a:hover { border-color: var(--amber); color: var(--amber-ink); }
@media (max-width: 860px) {
  .cv { grid-template-columns: 1fr; gap: var(--space-12); }
  .item { grid-template-columns: 1fr; gap: var(--space-1); }
}
</style>
