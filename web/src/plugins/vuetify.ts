import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import { VCalendar } from 'vuetify/labs/VCalendar';

export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#6750A4',
          secondary: '#FFB74D',
          accent: '#4DB6AC',
          error: '#f44336',
          success: '#4CAF50',
          info: '#2196F3',
          warning: '#FFC107',
          surface: '#FFFFFF',
          background: '#F8F7FF'
        }
      },
      dark: {
        dark: true,
        colors: {
          primary: '#8C9EFF',
          secondary: '#80CBC4'
        }
      }
    }
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi }
  },
  components: {
    VCalendar
  }
});

