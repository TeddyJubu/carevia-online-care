import { PageTitle } from '../ui/kit'
import { Outlet } from "react-router"
export function AccountLayout() { return <Outlet /> }
export function AccountHome() { return <div className="page"><PageTitle>AccountHome</PageTitle></div> }
export function FamilyPage() { return <div className="page"><PageTitle>FamilyPage</PageTitle></div> }
export function ProfilePage() { return <div className="page"><PageTitle>ProfilePage</PageTitle></div> }
export function SecurityPage() { return <div className="page"><PageTitle>SecurityPage</PageTitle></div> }
