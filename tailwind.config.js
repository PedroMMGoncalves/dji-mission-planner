import defaultTheme from 'tailwindcss/defaultTheme'

/**
 * Paleta do desenho aprovado (Outubro de 2026): o `slate` do Tailwind passa
 * a ser o azul-ardósia das pranchas, e as classes slate-* de toda a
 * interface mudam sem tocar em cada componente. O 400, o texto esbatido,
 * fica a 5,8:1 sobre os painéis (900) e a 4,7:1 sobre o 800 (AA para texto
 * corrido); o 600 fica tão claro como o antigo, para os marcadores e as
 * notas escritos nele não perderem contraste.
 */
const slate = {
  50: '#F4F7FB',
  100: '#E6EDF7', // texto
  200: '#C8D2E1',
  300: '#AEB9CC', // texto secundário
  400: '#8391A8', // texto esbatido
  500: '#66748F',
  600: '#4A5A78',
  700: '#27354F', // contornos
  800: '#1C2740', // superfícies levantadas, divisórias
  900: '#0D1424', // painéis e campos
  950: '#0A0F1C', // página
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate,
        panel: '#0D1424',
        // cartões e secções dentro dos painéis
        surface: '#111A2D',
        // cabeçalhos de tabela e caixas dentro de um cartão
        sunken: '#0E1729',
        // fundo das caixas dos campos
        field: '#0A1222',
        // realce ao passar o rato, linhas das tabelas
        raised: '#18233A',
        accent: '#38BDF8',
      },
      // Inter vem com a aplicação (@fontsource-variable/inter, em main.jsx):
      // funciona sem rede no campo; sem ela, a pilha do sistema de sempre
      fontFamily: {
        sans: ['"Inter Variable"', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
}
