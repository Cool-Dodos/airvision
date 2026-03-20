import { ApplicationConfig, ErrorHandler } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';

class GlobalErrorHandler implements ErrorHandler {
  handleError(err: any): void { console.error('[GlobalErrorHandler]', err); }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler }
  ],
};
