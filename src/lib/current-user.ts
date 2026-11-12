import type { JwtPayload, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type CurrentUser = {
	nombre: string
	email: string
	rol: Database['public']['Enums']['rol_usuario']
}

export type CurrentUserResult = {
	data: CurrentUser | null
	error: { message: string } | null
}

export async function getCurrentUser(
	supabase: SupabaseClient<Database>,
	claims: JwtPayload
): Promise<CurrentUserResult> {
	const { data, error } = await supabase
		.from('usuarios')
		.select('nombre, email, rol')
		.eq('id', claims.sub)
		.single()

	return {
		data: data ?? null,
		error: error ? { message: error.message } : null
	}
}
