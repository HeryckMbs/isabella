export type StoryStage = 'intro' | 'trail' | 'lights' | 'puzzle' | 'bloom' | 'gallery';

export const story = {
  intro: [
    'Isa, desde 2018 você caminha comigo de um jeito raro.',
    'Este jardim é uma forma simples de guardar o quanto sua amizade é preciosa para mim.',
    'Eu começo pequeno e sem detalhes, mas cada lembrança vai revelando um pouco do que essa amizade construiu.'
  ],
  trail: [
    'Vamos recolher sementes de lembrança. Cada uma acende um pedaço do caminho.',
    'Amizade fiel é isso: às vezes discreta, mas sempre presente.',
    'Você nunca precisou fazer barulho para ser importante.'
  ],
  lights: [
    'Agora guia as luzes com calma. Cuidado também é caminho.',
    'Quando algo pesa, eu desejo ser presença boa, sem invadir o seu espaço.',
    'Uma luz por vez. Uma memória por vez.'
  ],
  puzzle: [
    'A lembrança está na mesa do jardim. Caminhe até ela e interaja para montar a foto.',
    'Algumas lembranças só fazem sentido quando a gente aproxima as peças.'
  ],
  bloom: [
    'Pronto. O jardim entendeu.',
    'Que a vida te devolva em flor todo bem que você já espalhou.'
  ],
  gallery: [
    'Aqui ficam alguns pedaços da nossa história.',
    'Olha com calma. A galeria pode crescer sempre que você escolher novas fotos.'
  ]
} satisfies Record<StoryStage, string[]>;

export const stageLabels: Record<StoryStage, string> = {
  intro: 'Chegada ao jardim',
  trail: 'Trilha das memórias',
  lights: 'Luzes do cuidado',
  puzzle: 'Puzzle da lembrança',
  bloom: 'Florescimento',
  gallery: 'Galeria suspensa'
};
