import { JSXElement, Match, Switch } from "solid-js"
import { getSetting } from "~/store"
import { Box, Container as HopeContainer } from "@hope-ui/solid"

export const Container = (props: { children: JSXElement }) => {
  const container = getSetting("home_container")
  return (
    <Switch fallback={<Box class="flyfish-container">{props.children}</Box>}>
      <Match when={container === "hope_container"}>
        <HopeContainer class="flyfish-container">
          {props.children}
        </HopeContainer>
      </Match>
    </Switch>
  )
}
