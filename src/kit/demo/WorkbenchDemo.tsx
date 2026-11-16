// A demo host for the reusable kit (#/_workbench, not linked): it uses only src/kit/, with made-up data, to show that
// the kit works outside Shrimply Study. Each part has its own file.
import { MenuTreeDemo } from './MenuTreeDemo'
import { PopoutDemo } from './PopoutDemo'
import { TabsSplitDemo } from './TabsSplitDemo'

export function WorkbenchDemo() {
  return (
    <main className="kit-demo">
      <h1>Kit demo</h1>
      <MenuTreeDemo />
      <TabsSplitDemo />
      <PopoutDemo />
    </main>
  )
}
