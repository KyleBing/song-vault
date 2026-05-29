import {
    createDefaultDataTableDisplay,
    type DataTableDisplaySettings
} from '@shared/dataTableDisplay'
import { computed, inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'

const dataTableDisplayKey: InjectionKey<Ref<DataTableDisplaySettings>> = Symbol(
    'dataTableDisplay'
)

export function provideDataTableDisplay(settings: Ref<DataTableDisplaySettings>): void {
    provide(dataTableDisplayKey, settings)
}

export function useDataTableDisplay(): ComputedRef<DataTableDisplaySettings> {
    const settings = inject(dataTableDisplayKey, null)
    return computed(() => settings?.value ?? createDefaultDataTableDisplay())
}
