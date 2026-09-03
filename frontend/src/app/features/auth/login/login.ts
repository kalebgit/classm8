import { Component, inject } from '@angular/core';
import { AuthService } from '../../../core/api/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  auth = inject(AuthService);
}
