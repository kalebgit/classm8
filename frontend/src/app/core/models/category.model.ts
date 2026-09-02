export interface Category{
    id: number;
    name: string;
    percentage: number;
    course_id: number
}

export interface NewCategory {
    name: String;
    percentage: number;
    //no hay id porque las categorias siempre
    //se crean una vez se crea la materia y de ahi
    //se saca el dato
}