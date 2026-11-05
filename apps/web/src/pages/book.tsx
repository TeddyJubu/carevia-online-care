import { PageTitle } from '../ui/kit'
import { Outlet } from "react-router"
export function BookingLayout() { return <Outlet /> }
export function BookService() { return <div className="page"><PageTitle>BookService</PageTitle></div> }
export function BookWho() { return <div className="page"><PageTitle>BookWho</PageTitle></div> }
export function BookTime() { return <div className="page"><PageTitle>BookTime</PageTitle></div> }
export function BookAccount() { return <div className="page"><PageTitle>BookAccount</PageTitle></div> }
export function BookFamily() { return <div className="page"><PageTitle>BookFamily</PageTitle></div> }
export function BookConsent() { return <div className="page"><PageTitle>BookConsent</PageTitle></div> }
export function BookPay() { return <div className="page"><PageTitle>BookPay</PageTitle></div> }
