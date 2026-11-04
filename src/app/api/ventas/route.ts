import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { Venta } from '@/types/venta';
import { saleError, normalizeSale, monthRange } from '@/lib/validation';

// Solo columnas necesarias — evita traer datos extras de Supabase
const VENTAS_SELECT = 'id,folio,fecha_compra,canal,valor_garantia,comision_calculada,tipo_garantia,anos_garantia,precio_producto,cantidad_unidades,total_boleta,numero_pedido,vendedor_id';

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
    const validationError = saleError(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const data = normalizeSale(body as Venta);

    const supabase = getSupabaseServer();
    const { data: insertedData, error } = await supabase
      .from('ventas')
      .insert([{
        folio: data.folio,
        fecha_compra: data.fecha_compra,
        canal: data.canal,
        precio_producto: data.precio_producto ?? 0,
        cantidad_unidades: data.cantidad_unidades ?? 1,
        valor_garantia: data.valor_garantia ?? 0,
        anos_garantia: data.anos_garantia ?? 1,
        tipo_garantia: data.tipo_garantia ?? 'lineas_duras',
        total_boleta: data.total_boleta ?? 0,
        numero_pedido: data.numero_pedido ?? null,
        vendedor_id: data.vendedor_id,
      }])
      .select(VENTAS_SELECT)
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: existing, error: lookupError } = await supabase.from('ventas').select(VENTAS_SELECT)
          .eq('folio', data.folio).eq('fecha_compra', data.fecha_compra).eq('canal', data.canal).single();
        if (!lookupError && existing) {
          const previous = normalizeSale(existing as Venta);
          const fields: (keyof Venta)[] = ['folio', 'fecha_compra', 'canal', 'vendedor_id', 'precio_producto', 'cantidad_unidades', 'valor_garantia', 'total_boleta', 'tipo_garantia', 'anos_garantia', 'numero_pedido'];
          if (fields.every(field => previous[field] === data[field])) return NextResponse.json(existing);
        }
        return NextResponse.json({ error: 'Esta boleta ya fue ingresada (folio duplicado)' }, { status: 409 });
      }

      if (error.code === '42501') {
        const rlsMsg =
          "Bloqueo de seguridad RLS en Supabase (42501): La tabla 'ventas' tiene Row Level Security activo sin permisos de inserción para la clave actual. " +
          "Ejecuta el script 'supabase_rls_fix.sql' en tu panel de Supabase SQL Editor para habilitar los permisos.";
        console.error('❌ Supabase RLS Error:', error);
        console.error('💡 Solución: Ejecuta supabase_rls_fix.sql en el dashboard de Supabase (SQL Editor).');
        return NextResponse.json({ error: rlsMsg, code: 'RLS_POLICY_VIOLATION' }, { status: 403 });
      }

      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: error.message || 'No se pudo guardar la venta. Intenta nuevamente.' }, { status: 500 });
    }

    return NextResponse.json(insertedData);

  } catch (error: unknown) {
    console.error('Error en POST /api/ventas:', error);
    const msg = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vendedor_id = searchParams.get('vendedor_id');
    const mes = searchParams.get('mes');

    if (!vendedor_id?.trim() || vendedor_id.length > 120) {
      return NextResponse.json({ error: 'Se requiere vendedor_id' }, { status: 400 });
    }

    const range = mes ? monthRange(mes) : null;
    if (mes !== null && !range) return NextResponse.json({ error: 'Mes inválido. Usa YYYY-MM.' }, { status: 400 });

    const supabase = getSupabaseServer();
    let query = supabase
      .from('ventas')
      .select(VENTAS_SELECT)
      .eq('vendedor_id', vendedor_id)
      .order('fecha_compra', { ascending: false });

    if (range) {
      query = query.gte('fecha_compra', range.start).lte('fecha_compra', range.end);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase GET error:', error);
      return NextResponse.json({ error: 'No se pudieron cargar las ventas. Intenta nuevamente.' }, { status: 500 });
    }

    // Cache corto: 15s en el navegador, 30s en CDN — datos casi en tiempo real
    return NextResponse.json(data ?? [], {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });

  } catch (error: unknown) {
    console.error('Error en GET /api/ventas:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
